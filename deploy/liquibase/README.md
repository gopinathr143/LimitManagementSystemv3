# Liquibase migration image

Packages Liquibase + the OSS MongoDB extension + this repo's `db/changelog`
into one self-contained image, so `db/changelog/*.xml` — this project's
real source of truth (see `Docs/DEPLOYMENT.md` and `scripts/init-db.js`'s
own header comment) — can actually run anywhere: local machine, GoCD agent,
Kubernetes Job. No environment needs the `liquibase` CLI installed; it
needs `docker run`.

**Why this exists:** `scripts/init-db.js` is a hand-mirrored, native-driver
stand-in for `db/changelog` that has existed since this project's first
epic, specifically because no environment in this project's history has
had the Liquibase CLI available. This image closes that gap for real
deployments. **`scripts/init-db.js` is not being retired** — it's the fast,
no-Docker-dependency bootstrap every integration test file uses for its own
ephemeral per-test-file database (`tests/integration/helpers/setup.js`),
and spinning up a full Liquibase container per test file would be a real
regression there. The split going forward:

| Use case | Mechanism |
| :--- | :--- |
| Test suite bootstrap (per test file, dozens of times per run) | `scripts/init-db.js` (unchanged) |
| Real deployment (local, GoCD, Kubernetes) | This image, running `db/changelog` |

Verified working end to end in this session: real `liquibase status` (23
pending changesets found), real `liquibase update` (23 applied, validators
and indexes confirmed identical to what `scripts/init-db.js` produces —
same fields, same descriptions, same index keys), idempotent re-run (0
changes the second time), and the discrete-credentials auth path (see
below) tested against a real MongoDB user whose password contained
`@ / : #` — the exact characters that would break naive URL concatenation —
to prove nothing here ever builds a connection string by hand.

## Build

```bash
docker build -f deploy/liquibase/Dockerfile -t <registry>/imps-liquibase-migration:<tag> .
```

### Pointing at your private registry instead

`LIQUIBASE_BASE_IMAGE` is a build ARG, default `liquibase/liquibase:5.0.3`
(the official image — as of the 5.x line it ships Liquibase core only, no
database extensions baked in). If you already have an equivalent image in
your private registry (bundling Liquibase + the MongoDB extension), point
the build at it instead:

```bash
docker build -f deploy/liquibase/Dockerfile \
  --build-arg LIQUIBASE_BASE_IMAGE=your-registry.example.com/liquibase_mongo_migration:1.2.3 \
  -t <registry>/imps-liquibase-migration:<tag> .
```

This Dockerfile always layers `db/changelog`, the entrypoint, and (see
below) the MongoDB extension jars on top of whatever `LIQUIBASE_BASE_IMAGE`
resolves to. If your private image already includes the extension, the
jars this Dockerfile adds just sit alongside your own copies in
`/liquibase/lib` — harmless redundancy (Liquibase loads every jar in that
directory; an extra copy of the same classes doesn't break anything), not
a conflict. There's no way to conditionally skip the jar-fetch stage in a
plain Dockerfile without BuildKit (not assumed available — see below), so
if the redundancy bothers you, delete the two `COPY --from=fetch` /
`ARG LIQUIBASE_MONGODB_EXT_VERSION` etc. lines locally, or open an issue.

### Why plain `RUN curl | sha256sum -c`, not `ADD --checksum=`

Docker's `ADD --checksum=` is cleaner but requires BuildKit/buildx. Verified
in this session: this environment's Docker (29.5.2, no buildx plugin
installed) fails `ADD --checksum=` outright ("BuildKit is enabled but the
buildx component is missing"). The `RUN curl -fsSL -o ... && sha256sum -c`
pattern used here builds on both the legacy builder and BuildKit, so it
doesn't assume your CI agent has buildx either.

### Extension/driver versions

| Component | Version | Why |
| :--- | :--- | :--- |
| `liquibase/liquibase` (base) | `5.0.3` | Latest at the time this was built; verified pullable. |
| `liquibase-mongodb` (extension) | `5.0.3` | Its own release notes track core Liquibase version 1:1 starting the 5.0 line — keep this paired with the base image tag above if you bump either. |
| `mongodb-driver-sync` / `-core` / `bson` | `5.7.0` | The exact version `liquibase-mongodb:5.0.3`'s own POM declares as its `mongodb-driver.version` dependency — not picked independently. |

All four jars' SHA-256 checksums are pinned inline in the Dockerfile and
were verified against the real files served by Maven Central
(`repo1.maven.org`) in this session.

## Run

```bash
docker run --rm \
  -e MONGO_HOSTS=host1:27017,host2:27017,host3:27017 \
  -e MONGO_REPLICA_SET=rs0 \
  -e MONGO_AUTH_SOURCE=admin \
  -e MONGO_USERNAME=imps_velocity_app \
  -e MONGO_PASSWORD=... \
  -e MONGO_DB_NAME=imps_velocity \
  <registry>/imps-liquibase-migration:<tag>          # CMD defaults to `update`
```

Or `... <image> status` to preview without applying. `deploy/liquibase/entrypoint.sh`
assembles these into `LIQUIBASE_COMMAND_URL`/`_USERNAME`/`_PASSWORD` — the
password is passed as its own Liquibase-native env var, never concatenated
into the URL (same reasoning as `src/config/database.js`'s `auth` option
for the application itself — see `Docs/DEPLOYMENT.md` §3). A single
`MONGO_URI` env var also works, used verbatim, matching the application's
own precedence rules exactly.

Or set `LIQUIBASE_COMMAND_URL` (and `_USERNAME`/`_PASSWORD`) directly to
bypass the `MONGO_*` composition entirely and use Liquibase's own env vars.

## Where this is wired in

- `make migrate` / `make migrate-status` — builds and runs this image
  against your local `MONGO_URI` (or `MONGO_HOSTS`/etc.), replacing the
  previous requirement of a `liquibase` CLI on `PATH`.
- `deploy/k8s/migration/` — the Kubernetes Job now runs this image instead
  of `scripts/init-db.js`, wired identically to how the app Deployment's
  image is set (`kustomize edit set image`, see `.gocd.yaml`).
