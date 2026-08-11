# STORY-06-02 — Observability and alerting

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.11 |
| **BRD UAT mapping** | None (operational) |
| **Depends on** | STORY-04-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Expose the metrics that reveal silent enforcement corruption early, per client and per dimension and window. Compensation failure rate and counter drift are the two leading indicators that the system is quietly deciding wrongly.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the service under load | metrics are scraped | decision counts, rejections broken down by breached dimension window and metric, in-progress responses and error rates are all exposed per client |
| 2 | compensation failures or counter drift occurring | the condition arises | it is surfaced as a metric and raises an alert, since these indicate silent enforcement corruption |
| 3 | write conflict rate and retry exhaustion rising on a counter tier | the trend develops | it is visible per tier and alerts before it breaches the latency budget, giving early warning that a shard factor is undersized |
| 4 | latency measurement | it is collected | p50, p95 and p99 are reported per counter tier as well as end to end |
| 5 | replication lag on the primary path | it exceeds tolerance | an alert fires, because a stale counter read causes over-approval |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — the metric catalogue and `GET /metrics` endpoint are proven locally (unit tests plus a manual end-to-end scrape against a live server); not yet scraped by a real Prometheus instance or reviewed in a shared environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/metrics.service.test.js`, `tests/unit/replicationLag.service.test.js`, `tests/unit/retry.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/replicationLag.test.js` (the real driver call the unit-tested policy sits on top of)
- [ ] Code reviewed and approved by a second engineer
- [x] Structured logs and metrics emitted per Section 4.11 of the BRD — this story IS the §4.11 implementation; every AC below maps to a concrete metric in `src/services/metrics.service.js`
- [x] BRD section updated if implementation diverged from the written design — see divergence notes below
- [ ] On-call runbooks exist for every alert defined in this story — **not produced.** No on-call tooling (PagerDuty, Alertmanager) exists to route to in this environment; see the "alerting" divergence note below for what's implemented instead

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Dashboard | Link to the dashboard showing all required metric families | **No dashboard exists** — no Grafana/Prometheus instance is deployed in this environment. Manual proof instead: a live server's `GET /metrics` output was captured showing `imps_transaction_decisions_total`, `imps_transaction_rejections_total`, `imps_counter_tier_duration_seconds` (histogram), `imps_transaction_request_duration_seconds` (histogram), `imps_replication_lag_seconds` all populated after real traffic | |
| Alert test | Evidence of each alert firing in a controlled test | `tests/unit/replicationLag.service.test.js` ("a secondary beyond tolerance is unhealthy and logs an alert"); `tests/integration/reconciliation.test.js` (drift detection, reused from EPIC-05, now also counted via `imps_counter_drift_total`); `tests/integration/transaction.reversal.test.js` AC6 (floor-guard failure, now also counted via `imps_floor_guard_failures_total`) — each is a structured `logger.error` today, not a routed page (see divergence note) | |
| Runbook review | Sign-off from the on-call owner | **Not obtained** — no on-call owner or rotation exists to sign off; see STORY-05-02's reconciliation runbook note for the same limitation | |

## Notes / Risks

**Divergence — alerting is a structured log line, not a routed page.** AC2/AC3/AC5's "raises an alert" is implemented as a `logger.error`/`logger.warn` call carrying every field an alert rule would need (see `src/services/reconciliation.service.js`'s drift logs, `src/services/replicationLag.service.js`'s lag log, `src/services/transaction.service.js`'s floor-guard-failure logs) plus the matching counter/gauge in `MetricsService`. Routing those into a real page (Alertmanager, PagerDuty) needs infrastructure this environment doesn't have; what's implemented is the complete signal a real alerting layer would consume, matching the same policy-only precedent as `ClockSkewMonitor` (STORY-04-06).

**Metric catalogue (AC1/AC4), by name, in `src/services/metrics.service.js`:**
- `imps_transaction_decisions_total{clientId,outcome}` — AC1 decision counts
- `imps_transaction_rejections_total{clientId,dimensionCode,windowType,metric}` — AC1 rejection breakdown
- `imps_transaction_in_progress_total{clientId}` — AC1 409/in-progress responses
- `imps_transaction_errors_total{clientId,code}` — AC1 error rate
- `imps_floor_guard_failures_total{clientId,tier,source}` and `imps_counter_drift_total{clientId,action}` — AC2 compensation-failure rate and counter drift
- `imps_counter_retry_attempts_total{tier}` / `imps_counter_retry_exhausted_total{tier}` — AC3 write-conflict/retry-exhaustion per tier (wired into `withTransientRetry` via optional `onTransient`/`onExhausted` hooks, `src/utils/retry.js`)
- `imps_counter_tier_duration_seconds{tier}` (histogram) and `imps_transaction_request_duration_seconds` (histogram) — AC4 p50/p95/p99 per tier and end-to-end
- `imps_replication_lag_seconds` (gauge) — AC5, backed by `ReplicationLagMonitor`

**`imps_transaction_decisions_total` counts a *new* decision once, not every replay.** An idempotent replay of an already-resolved transaction (STORY-04-01 AC2) returns the stored result verbatim without re-running the waterfall — it is not counted again, so this metric reflects genuine decisions made, not total request volume. This was a deliberate choice to keep the metric meaningful for "how many times did the engine decide something" rather than needing a second metric to distinguish first-decision from replay traffic; replay volume itself is not currently exposed as its own metric (a reasonable follow-up if replay rate ever becomes operationally interesting).

**Replication-lag tolerance (AC5) has no BRD-specified number** (unlike clock skew's explicit ±1s). `ReplicationLagMonitor` defaults to 10 seconds, documented in-code as a tunable policy default rather than a BRD figure — see `src/services/replicationLag.service.js`.
