# Deployment Guide — IMPS Outward Velocity Limit System

**Scope:** how to build, ship and run this service — container image, Kubernetes manifests, the GoCD pipeline, and the resources it needs. Companion to `Docs/00-INDEX.md` (feature backlog) and `Docs/BRD_v7_Direction.md` (functional spec); this document is deployment/infrastructure only.

**Honesty note, consistent with the rest of `Docs/`:** every claim below is marked as either *verified in this session* (built, run, or applied against a real Docker daemon / real Kubernetes API server) or *design/recommendation, not executed* (no GoCD server, no managed MongoDB, no staging/production cluster exists in this session to run it against). Section 9 makes the distinction explicit.

---

## 1. Architecture summary

- A single stateless Node.js/Express service (`src/server.js`) — no session state, no local disk state. Horizontally scalable; any instance can serve any request.
- One dependency: MongoDB, **as a real replica set** (not standalone) — the driver is configured for `retryWrites`, primary-only reads on the enforcement path, and majority write concern on the transaction record (`src/config/database.js`). A standalone `mongod` will not work correctly.
- No authentication (deliberate, documented architectural decision — see `src/middleware/resolveClientId.middleware.js`). Treat the network path to this service as a trust boundary: it must sit behind whatever perimeter (VPC-internal only, mTLS at the mesh/ingress layer, etc.) makes "any caller who can reach this service can act as any `clientId` in the URL path" an acceptable statement for your deployment. This is unchanged by this document and is called out here because it directly affects how you're allowed to expose the Service/Ingress.
- In-process caches warm at startup and poll every 2s thereafter (`ConfigCache`) — a config change made via the admin API propagates to every replica within that window, no restart needed.
- Background loops run inside the same process (config cache polling, stale-claim reaper, reconciliation sweeper, replication-lag monitor, archival sweep) — there is no separate worker deployment to run.

## 2. Prerequisites

| Requirement | Version / notes |
| :--- | :--- |
| Node.js | Exactly `24.12.0` in CI/production (`package.json` `engines.node`; `.nvmrc`/`.node-version`). The Docker image pins `node:24.12.0-alpine` for this reason — do not float to `node:24-alpine`, see the Dockerfile's comment. |
| Yarn | Classic 1.22.x (`corepack enable` on the pinned Node resolves this; there is no `packageManager` field, and `.yarnrc.yml`'s `nodeLinker` key is a harmless no-op under classic Yarn). |
| Docker | Any recent version able to build the multi-stage `Dockerfile` — verified in this session with Docker 29.7.1. |
| Kubernetes | `kubectl` >= 1.27 (ships `kubectl kustomize` / `apply -k` built in — no separate `kustomize` binary required). Verified in this session with `kubectl` 1.36 client against a local `k3s` (Colima) 1.27+ server. |
| MongoDB | A real replica set, MongoDB 7.0+ recommended (local dev/CI is pinned to `mongo:7`; see `00-INDEX.md`'s open item on confirming 5.0+ across every real environment). A single-node `rs0` (as in `docker-compose.yml`) is **dev/CI only** — see §8 for the production topology. |
| Container registry | Any (ECR, GCR, Docker Hub, Harbor, ...) reachable from both the GoCD build agent and the target cluster's nodes. |
| GoCD | Server with the [YAML config-repo plugin](https://github.com/tomzo/gocd-yaml-config-plugin) installed, pointed at this repo (`.gocd.yaml`). See §7 for one-time setup. |

## 3. Environment variables

Source of truth: `src/config/env.js` / `.env.example`.

| Variable | Required | Default | Notes |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3000` | |
| `NODE_ENV` | No | `development` | Set `production` in every deployed environment. |
| `LOG_LEVEL` | No | `info` | Pino level. `debug` is noisy — use only in staging/local. |
| `MONGO_DB_NAME` | **Yes** | `imps_velocity` | |
| `ACTOR_HEADER` | No | `x-actor-id` | Optional, unverified caller-supplied header name recorded on audit entries — not a credential. |

### MongoDB connection — two supported shapes

`src/config/env.js` resolves the connection in this order:

1. **`MONGO_URI` set** — used verbatim as the full connection string. Simplest for local dev/CI (`docker-compose.yml`'s single-node `rs0` has no auth configured, so this is what the test suites and `yarn dev` use — no change here).
2. **`MONGO_URI` unset** — assembled from the discrete variables below. This is the shape a real AWS multi-node replica set wants: hosts, username, replica-set name and auth source are **not secret** and belong in a ConfigMap; only the password is a Secret value, and it is passed to the MongoDB driver as a separate `auth` option (`src/config/database.js`) — **never concatenated into the connection string**, so there's no percent-encoding footgun for special characters in a password and the assembled URI is safe to log if ever needed.

| Variable | Required (shape 2) | Default | Notes |
| :--- | :--- | :--- | :--- |
| `MONGO_HOSTS` | Yes | `localhost:27017` | Comma-separated `host:port` list of the replica set's members — no scheme, no credentials. e.g. `mongo-a.internal:27017,mongo-b.internal:27017,mongo-c.internal:27017`. |
| `MONGO_REPLICA_SET` | No | `rs0` | |
| `MONGO_AUTH_SOURCE` | No | `admin` | Only added to the assembled URI when `MONGO_USERNAME` is set. |
| `MONGO_USERNAME` | No (but see below) | _(unset)_ | Setting this is what switches `connectToDatabase()` into passing an `auth` option to the driver at all. |
| `MONGO_PASSWORD` | Yes, if `MONGO_USERNAME` is set | _(unset)_ | **Secret value — Kubernetes Secret only, never a ConfigMap, never committed.** |

Verified in this session: connecting with `MONGO_HOSTS`/`MONGO_USERNAME`/`MONGO_PASSWORD` against a real MongoDB user succeeds (a real authenticated write), the assembled `env.mongo.uri` contains no password at any point, and a wrong password fails closed with `MongoServerError: Authentication failed` rather than silently falling back to anything.

## 4. Container image

`Dockerfile` at repo root — multi-stage (`deps` installs with the lockfile via `yarn install --immutable`; `runtime` copies only `node_modules`, `src`, `scripts`, `db` into a non-root `node:24.12.0-alpine`). No build step — this is plain JavaScript, nothing to compile or bundle.

```bash
docker build -t <registry>/imps-velocity-system:<tag> .
```

**Verified in this session:** the image builds clean, starts, connects to a real MongoDB replica set, warms its config cache, serves `/health` as `200`, and — critically — shuts down gracefully on `SIGTERM` (`docker stop` closes the Mongo connection and exits 0, no forced kill needed), which is what makes a Kubernetes rolling update safe.

The image's own `HEALTHCHECK` and the Kubernetes probes in §5 both hit `GET /health`. That endpoint is a **liveness signal only** — it returns `200` as long as the Express process is up; it does **not** re-check MongoDB reachability after startup (`src/routes/index.js`). A MongoDB outage after a pod is already `Ready` surfaces as request-level `5xx`/`SYSTEM_FAILURE` responses (fail-closed, per BRD §4.9 — never a silent approval), not as a failed probe. This is a known, accepted gap — see §9.

## 5. Kubernetes manifests

```
deploy/k8s/
├── base/                    # the app: Namespace, ConfigMap, Deployment, Service, PDB, HPA
├── overlays/
│   ├── staging/              # namespace=imps-velocity-staging, replicas=1, LOG_LEVEL=debug, tighter HPA bounds
│   └── production/            # namespace=imps-velocity, base values as-is
├── migration/
│   ├── base/                 # the schema/index bootstrap Job — runs the real Liquibase image, see deploy/liquibase/
│   └── overlays/{staging,production}/
└── base/secret.example.yaml  # TEMPLATE ONLY — not applied by kustomize, never commit a filled-in copy
```

The migration Job runs `deploy/liquibase/`'s image, not the app image — a separate, dedicated container that packages Liquibase + the MongoDB extension + `db/changelog` (this project's real source of truth) so migrations run identically in any environment with no `liquibase` CLI installed anywhere. See `deploy/liquibase/README.md` for the full detail (build args to point at a private-registry base image, version pinning, why it's a self-contained image at all). `scripts/init-db.js` still exists and still runs — it's the test suite's own fast, no-Docker-dependency bootstrap for ephemeral per-test-file databases (`tests/integration/helpers/setup.js`), a different concern from this Job.

**Verified in this session:** all six kustomize builds (`base`, both app overlays, migration `base`, both migration overlays) render with `kubectl kustomize` with no errors, and the staging overlay was applied for real to a local Kubernetes API server (Colima/k3s) — the Namespace, ConfigMap, Service, Deployment, PodDisruptionBudget and HorizontalPodAutoscaler were all created correctly and scoped to the right namespace by the `namespace:` transformer. With no Secret present (as expected — Secrets are deliberately not part of the kustomize tree), the pod correctly sat in `CreateContainerConfigError` rather than crash-looping or starting half-configured — the same fail-closed posture the application code itself follows.

### Secrets

`deploy/k8s/base/secret.example.yaml` documents the one Secret value the app needs (`imps-velocity-mongo-credentials`, key `MONGO_PASSWORD` only — hosts/username/replica-set/auth-source all live in `configmap.yaml` instead, see §3) — it is **not** referenced by any `kustomization.yaml` and must never be filled in and committed. Recommended, in order of preference:

1. A secrets manager + operator (External Secrets Operator, Vault Agent Injector, Sealed Secrets, or your cloud provider's native CSI secret driver) syncing into `imps-velocity-mongo-credentials` in each namespace ahead of deploy.
2. A separate, access-controlled step (human or a dedicated pipeline with tighter permissions than the app-deploy pipeline) running `kubectl create secret generic imps-velocity-mongo-credentials --from-literal=MONGO_PASSWORD=... -n <namespace>` once per environment, rotated out-of-band.

Either way, **the `imps-velocity-system` GoCD pipeline never sees or handles the Mongo password** — it only waits for the Secret to already exist (the migration Job and app Deployment both `envFrom.secretRef` it and fail closed if it's missing, as verified above). The non-secret pieces (`MONGO_HOSTS`, `MONGO_USERNAME`, etc.) are ordinary ConfigMap values, per-environment via `deploy/k8s/overlays/{staging,production}/mongo-hosts-patch.yaml` — replace their `REPLACE_ME_*` placeholders with your real AWS replica-set member hosts.

### Resource requests/limits, replica counts, HPA

See §9 — these values need real staging load-test numbers before they're anything more than a sane starting point.

### Database migrations (Liquibase)

`db/changelog/*.xml` is this project's real source of truth for the MongoDB
schema (collection validators, indexes) — but for most of this project's
history nothing could actually run it: no environment had the Liquibase CLI
installed. `deploy/liquibase/` closes that gap with a self-contained image
(Liquibase + the OSS MongoDB extension + `db/changelog` baked in), so
migrations run identically anywhere via `docker run` — no CLI install, no
repo checkout alongside it. Full detail in `deploy/liquibase/README.md`
(build args, exact extension/driver versions and their pinned checksums,
why the base image is a build ARG). In short:

- **Local dev:** `make migrate` / `make migrate-status` (also `yarn migrate` /
  `yarn migrate:status` — the Makefile targets are thin wrappers around the
  same `scripts/migrate.sh`, matching every other target in this Makefile).
  Builds the image and runs it against `make mongo-up`'s replica set by
  default; override `MONGO_HOSTS`/`MONGO_USERNAME`/`MONGO_PASSWORD`/etc. (or
  `MONGO_URI`) to target anything else.
- **Kubernetes:** the migration Job (`deploy/k8s/migration/`) runs this
  image, not the app image — see §6 step 5 and §7's `build_image` stage.
- **Your own private-registry image:** `LIQUIBASE_BASE_IMAGE` is a build ARG
  (default: the public `liquibase/liquibase` image) — point it at your own
  pre-built Liquibase+MongoDB-extension image instead, e.g.
  `docker build -f deploy/liquibase/Dockerfile --build-arg LIQUIBASE_BASE_IMAGE=your-registry.example.com/liquibase_mongo_migration:1.2.3 ...`.
  If that image already bundles the MongoDB extension, this Dockerfile's own
  copy of the extension jars just sits alongside it — harmless redundancy,
  not a conflict.

**Verified in this session, against a real MongoDB replica set:** `status`
correctly lists all 23 pending changesets on a fresh database; `update`
applies all 23 and produces collection validators and indexes byte-identical
in shape to what `scripts/init-db.js` produces (same required fields, same
`enabledDirections` description text, same index keys); re-running `update`
is a genuine no-op (`Run: 0, Previously run: 23`); the discrete-credentials
path was tested against a real MongoDB user whose password contained
`@ / : #` (specifically chosen to break naive URL concatenation) and
authenticated correctly; a wrong password fails closed with a real
`MongoServerError`/exit code 1, not a silent fallback. The `LIQUIBASE_BASE_IMAGE`
override was proven to genuinely swap the base image (built with an alternate
public tag and confirmed the resulting image reports that version) — the
private-registry path itself was not tested against an actual private
registry (none exists in this session), only the build-arg mechanism that
makes it possible.

`scripts/init-db.js` is **not retired** — it remains the integration test
suite's own fast, no-Docker-dependency bootstrap for each test file's
ephemeral database (`tests/integration/helpers/setup.js`); replacing that
with a full Liquibase container per test file would be a real regression
there. It is simply no longer what real deployments use.

## 6. Manual deployment (no GoCD — first bring-up, or a human doing it directly)

1. **Provision MongoDB** — a real replica set reachable from the cluster (see §9 for sizing). Confirm the shard key recommendation from `Docs/stories/STORY-06-01-...md` (`{clientId: 1, claimedAt: 1}`) is applied if/when the `transactions` collection is sharded. Create an application database user scoped to `imps_velocity` (not an admin-level account).
2. **Build and push both images** — the app, and the Liquibase migration image:
   ```bash
   docker build -t <registry>/imps-velocity-system:<tag> .
   docker push <registry>/imps-velocity-system:<tag>

   docker build -f deploy/liquibase/Dockerfile -t <registry>/imps-liquibase-migration:<tag> .
   # Or, pointing at your own pre-built Liquibase+MongoDB-extension image instead
   # of the public liquibase/liquibase default — see deploy/liquibase/README.md:
   #   docker build -f deploy/liquibase/Dockerfile \
   #     --build-arg LIQUIBASE_BASE_IMAGE=your-registry.example.com/liquibase_mongo_migration:1.2.3 \
   #     -t <registry>/imps-liquibase-migration:<tag> .
   docker push <registry>/imps-liquibase-migration:<tag>
   ```
3. **Set the real replica-set hosts** for the target environment — edit `deploy/k8s/overlays/staging/mongo-hosts-patch.yaml` (or `overlays/production/...`) and replace its `REPLACE_ME_*` placeholders with your actual AWS member hosts; do the same for `MONGO_USERNAME` in `deploy/k8s/base/configmap.yaml` if it differs from the `imps_velocity_app` placeholder. Both are ordinary, non-secret config — commit the real hosts/username.
4. **Create the namespace and Secret** for the target environment (`imps-velocity-staging` or `imps-velocity`) — **password only**, nothing else:
   ```bash
   kubectl create namespace imps-velocity-staging   # or apply the overlay first — it creates it too
   kubectl create secret generic imps-velocity-mongo-credentials \
     --from-literal=MONGO_PASSWORD='<the application user'"'"'s password>' \
     -n imps-velocity-staging
   ```
5. **Run the migration Job** (real Liquibase, real `db/changelog` — idempotent, safe to re-run; verified in this session: a second `update` run reports "Run: 0, Previously run: 23"):
   ```bash
   cd deploy/k8s/migration/base
   kustomize edit set image imps-liquibase-migration=<registry>/imps-liquibase-migration:<tag>   # or: kubectl kustomize... | sed, if you don't have the `kustomize` binary — kubectl's built-in kustomize doesn't expose `edit`, so this one step needs the standalone kustomize CLI, or hand-edit the image line
   cd ../overlays/staging
   kubectl delete job/imps-velocity-migration -n imps-velocity-staging --ignore-not-found
   kubectl apply -k .
   kubectl wait --for=condition=complete job/imps-velocity-migration -n imps-velocity-staging --timeout=120s
   ```
6. **Deploy the app:**
   ```bash
   cd deploy/k8s/base
   kustomize edit set image imps-velocity-system=<registry>/imps-velocity-system:<tag>
   cd ../overlays/staging
   kubectl apply -k .
   kubectl rollout status deployment/imps-velocity-system -n imps-velocity-staging --timeout=180s
   ```
7. **Verify:**
   ```bash
   kubectl -n imps-velocity-staging port-forward svc/imps-velocity-system 3000:80
   curl -s localhost:3000/health
   curl -s localhost:3000/metrics | head -20
   ```
8. **Smoke-test one real transaction** end to end (no auth — `clientId` is a path segment):
   ```bash
   curl -s -X POST localhost:3000/clients -d '{"clientId":"SMOKE1","name":"Smoke Test","timezone":"Asia/Kolkata"}' -H 'content-type: application/json'
   curl -s -X PUT localhost:3000/clients/SMOKE1/dimensions -d '{"direction":"OUTWARD","allowedDimensions":[{"code":"GLOBAL","attributes":[],"windows":["DAILY_CALENDAR"]}]}' -H 'content-type: application/json'
   curl -s -X POST localhost:3000/clients/SMOKE1/limits -d '{"direction":"OUTWARD","dimensionCode":"GLOBAL","windowType":"PER_TXN","thresholdAmount":100000}' -H 'content-type: application/json'
   curl -s -X POST localhost:3000/clients/SMOKE1/transactions -d '{"direction":"OUTWARD","transactionId":"SMOKE-TXN-1","amount":100}' -H 'content-type: application/json'
   ```
   Expect the final call to return `{"success":true,"data":{"transactionId":"SMOKE-TXN-1","status":"APPROVED",...}}`.

Repeat against `overlays/production` for a production rollout (same steps, different namespace/kubeconfig context, same immutable image tag — never rebuild for production, promote the exact artifact staging already validated).

## 7. GoCD pipeline (`.gocd.yaml`)

**Design/recommendation, not executed against a real GoCD server in this session** — no GoCD instance exists here. The YAML is validated as well-formed against the plugin's documented schema and mirrors exactly the manual steps in §6 (nothing in it is speculative beyond what §6 already proves works).

### One-time GoCD server setup

1. Install the [YAML config-repo plugin](https://github.com/tomzo/gocd-yaml-config-plugin) if not already present.
2. **Admin → Config Repositories → Add** — point it at this Git repo, plugin `yaml.config.plugin`, root path `/` (`.gocd.yaml` is auto-discovered).
3. **Agents:** tag at least one agent resource `docker` (needs Docker available — either a privileged/DinD agent or a host-mounted socket) and at least one `k8s-deploy` (needs `kubectl` >= 1.27 with a kubeconfig already scoped to the right cluster — one agent/profile per target environment is the simplest way to keep staging and production credentials separate).
4. **Secret config:** add a secret config with id `imps-velocity-secrets` (any supported backend — file-based, Vault, etc.) providing `registry_user` / `registry_password`. Referenced in the pipeline as `{{SECRET:[imps-velocity-secrets][registry_user]}}` — nothing secret is inlined in `.gocd.yaml`.
5. Set the pipeline environment variable `DOCKER_REGISTRY` (Admin → Pipelines → `imps-velocity-system` → Environment Variables) to your real registry host — it's a placeholder in the checked-in YAML.

### Stages (pipeline `imps-velocity-system`)

| Stage | Trigger | What it does |
| :--- | :--- | :--- |
| `test` | Every commit to `main` | `yarn install --immutable`, `yarn lint`, brings up the same `docker-compose` MongoDB replica set local dev uses, `yarn db:init`, `yarn test:all` (unit + integration — 143 + 113 tests as of EPIC-08). Tears the compose stack down unconditionally (`run_if: [passed, failed]`) so a failed run never leaks a container on the agent. |
| `build_image` | On `test` success | Builds **both** images once — the app and `deploy/liquibase/`'s migration image — tags each `${GO_PIPELINE_LABEL}` (monotonic, traceable to the exact commit via `label_template`), pushes both to `DOCKER_REGISTRY`. |
| `deploy_staging` | Automatic, on `build_image` success | Runs the migration Job (delete-then-apply-then-wait, so it's never stale from a prior run), then `kubectl apply -k` the `staging` overlay, then waits on rollout status. |
| `deploy_production` | **Manual approval gate** (`approval: type: manual`) | Identical steps, targeting the `production` overlay. Promotes the exact image `deploy_staging` already ran — this pipeline never rebuilds for production. |

A second, independent pipeline — `imps-velocity-system-certification` — runs `yarn test:integration:slow` (the throughput/hot-counter certification suite, STORY-07-01/07-02; ~45s including a real TTL wait) on a nightly timer, not on every commit, so it never slows down normal feedback. Read those two stories' own "Notes" before treating its output as a production capacity certification — a single agent is not the BRD's sized, production-representative load-test environment.

### Rollback

Because every deploy promotes an immutable, already-built image tag (never rebuilds), rolling back is either:
- Re-run the `deploy_production` stage of a **previous, already-green** pipeline run (GoCD keeps history — this redeploys that exact prior image), or
- `kubectl rollout undo deployment/imps-velocity-system -n imps-velocity` directly (Kubernetes keeps `revisionHistoryLimit: 5` — `deploy/k8s/base/deployment.yaml`) for an immediate rollback without going back through GoCD.

**A code rollback does not undo a bad configuration change.** Registry/dimension/limit changes made through the admin API live in MongoDB, not in the container image — reverting the Deployment does nothing to a limit definition someone lowered incorrectly an hour ago. Use the config-audit trail (`configAudit`/`limitsAudit` collections, STORY-01-01/02-04) to identify and manually revert that change through the same admin API.

## 8. MongoDB topology (not managed by the manifests in this repo)

This repo's Kubernetes manifests deliberately do **not** include a MongoDB StatefulSet — `docker-compose.yml`'s single-node `rs0` is dev/CI-only and is not a safe production topology (no failover, and BRD §4.9 AC5's step-down/failover behavior has literally never been exercised against it — see `Docs/stories/STORY-06-03-...md`'s own notes). For staging/production, provision:

- **A genuine multi-node replica set** — minimum 3 data-bearing nodes (PSS) for real automatic failover, or managed (Atlas / equivalent) if that's an option for this deployment. A 2-node + arbiter (PSA) topology avoids the third data node's storage cost but cannot serve reads with `w:majority` acknowledged during a single node's outage — confirm this trade-off is acceptable before choosing it.
- **`retryWrites=true` and a `replicaSet=` connection string param** — the driver is already configured to require primary reads (`src/config/database.js`); pointing it at anything other than a real replica set will misbehave.
- The recommended shard key if/when `transactions` is sharded: `{clientId: 1, claimedAt: 1}` (`Docs/stories/STORY-06-01-...md`'s Notes — `clientId` for tenant locality, `claimedAt` to avoid a single monotonically-increasing global hotspot).

Sizing figures for this are in §9.

## 9. Required resources

### Application tier (per pod)

```yaml
requests: { cpu: 250m, memory: 256Mi }
limits:   { cpu: 1000m, memory: 512Mi }
```
(`deploy/k8s/base/deployment.yaml`.) This is a lightweight, I/O-bound Express service — it does no CPU-heavy work per request (the counter engine's cost is almost entirely MongoDB round trips), so these numbers are a conservative starting baseline, **not a sized production figure**. The only real measurements that exist come from `tests/integration-slow/loadCertification.test.js` / `hotCounterCertification.test.js`, run on a single shared laptop, not the BRD's sized production topology:

| Measurement | Result (this session, single laptop) | What it does/doesn't prove |
| :--- | :--- | :--- |
| Internal engine latency, 1,500 concurrent requests | p50 ~30ms, p99 ~70-120ms | Comfortably inside the BRD's <100ms internal budget on unrepresentative hardware — a real signal the design isn't pathological, not a capacity number. |
| Achieved local throughput | ~780-1,160 req/s over a few seconds, single process | **Not** a 1,000 RPS *sustained* certification (BRD §4.1/UAT 5) — too short a run, one process, one laptop. See STORY-07-01's own notes. |
| Hot-counter shard spread, shardFactor 8 | 8 shard docs, max single-shard share 13.6% of writes, overshoot 3.5% of a 2,000 threshold | Proves the sharding mechanism works and overshoot stays small — not a certification of any specific `shardFactor` at real production write rates (STORY-07-02). |

**Replica count / HPA:** the base Deployment ships `replicas: 2` with a CPU-based HPA (`minReplicas: 2, maxReplicas: 8`, target 70% CPU — `deploy/k8s/base/hpa.yaml`). Its own comment flags the honest limitation: CPU utilization is a poor proxy for this service's real bottleneck (MongoDB counter contention and write latency, not CPU). Before trusting this at real load, either (a) run a real staging load test and re-tune both the resource requests and the HPA target, or (b) wire a request-latency- or queue-depth-based custom metric (a Prometheus adapter reading `imps_transaction_request_duration_seconds`, already emitted — `src/services/metrics.service.js`) instead of plain CPU.

### MongoDB tier

Extrapolated from BRD §4.7's own methodology and `Docs/stories/STORY-08-06-inward-capacity-and-sizing-assessment.md` (written this session, also not independently measured against real production traffic):

| Scenario | `transactions` doc growth | Storage growth |
| :--- | :--- | :--- |
| OUTWARD only, 1,000 RPS (BRD §4.7 baseline) | ~86.4M docs/day (~2.6B/month) | ~40-60 GB/day at 400-600 bytes/doc + indexes |
| OUTWARD + INWARD, **per-direction** interpretation (each independently up to 1,000 RPS) | up to ~172.8M docs/day | up to ~80-120 GB/day (worst case) |
| OUTWARD + INWARD, **combined** interpretation (shared 1,000 RPS ceiling) | unchanged from the baseline row — same total, split by `direction` | unchanged from the baseline row |

Whether the 1,000 RPS target is per-direction or combined is an **open business/infrastructure decision** (`00-INDEX.md`'s open items table, owner: Business and Infrastructure) — size storage/IOPS against whichever is actually confirmed, not both. The counters collection also roughly doubles in steady-state document count for a client with symmetric OUTWARD/INWARD registries (bounded by TTL regardless — STORY-03-01), independent of which interpretation applies.

**No IOPS figure, no infrastructure sign-off exists for any of the above** — this is explicitly recorded as an open item in `Docs/stories/STORY-08-06-...md` and `Docs/stories/STORY-06-01-...md`, not silently assumed. Treat it as a required pre-launch deliverable (BRD §4.7's own words), not a follow-up.

## 10. Observability

- `GET /health` — liveness only, see §4's caveat.
- `GET /metrics` — Prometheus exposition format (`prom-client`, `src/services/metrics.service.js`). The Deployment already carries `prometheus.io/scrape: "true"` pod annotations for a standard Prometheus scrape-by-annotation setup.
- Key metrics to alert on: `imps_transaction_errors_total` (5xx/`SYSTEM_FAILURE` rate), `imps_floor_guard_failures_total` and `imps_counter_drift_total` (compensation/reconciliation health — any non-zero rate is a real drift signal, not noise), `imps_counter_retry_exhausted_total` (an undersized `shardFactor`), `imps_replication_lag_seconds` (BRD §4.6's primary-read guarantee depends on this staying low).
- Logs are structured JSON (Pino) to stdout — no file-based logging, matches container/Kubernetes conventions directly. Account numbers and UCIC are redacted at the logger level (`src/config/logger.js`) regardless of call site.

## 11. Known gaps (carried forward honestly, not silently assumed away)

| Gap | Where it's tracked |
| :--- | :--- |
| No shared/production-representative load-test environment exists to certify the BRD's literal 1,000 RPS target | `Docs/stories/STORY-07-01-...md`, `STORY-07-02-...md` |
| Statutory record retention term, RTO/RPO and DR topology, field-level encryption decision — none confirmed | `00-INDEX.md` open items table |
| No infrastructure sign-off on MongoDB storage/IOPS sizing, including the two-direction extension in §9 | `Docs/stories/STORY-08-06-...md` |
| `/health` doesn't reflect post-startup MongoDB reachability | §4 above |
| HPA is CPU-based, not a direct proxy for this service's real bottleneck | §9 above |
| No image vulnerability scanning wired into the pipeline yet (a `trivy image` or `docker scout` step is a reasonable, low-effort addition to the `build_image` stage) | this document — a recommendation, not yet built |
| This `.gocd.yaml` has not been run against a real GoCD server | §7 above |
| `deploy/liquibase/`'s private-registry override (`LIQUIBASE_BASE_IMAGE`) was proven as a build-arg mechanism, but never tested against an actual private registry image (none exists in this session) | §5 "Database migrations" above |
