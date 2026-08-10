# IMPS Outward Velocity Limit System — Delivery Backlog

**Source specification:** BRD v7.0 (`BRD_v7_Direction.md`)
**Epics:** 8 · **Stories:** 38 · **Total estimate:** 221 points
**Overall progress:** 0 / 38 stories complete

---

## How to use this backlog

Each story is a self-contained file holding its description, acceptance criteria in Given / When / Then form, a Definition of Done, and a completion-evidence table.

**Status values:** `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`

**Updating status — two places, always:**
1. The `Status` field in the story file, plus `Completed on` and `Verified by` when it closes.
2. The matching row in this index, and the epic file's story table.

**A story is `Done` only when:**
- Every acceptance criterion passes in a shared (non-local) environment, and
- Every Definition of Done item is ticked, and
- Every row of the story's completion-evidence table has a recorded link or reference.

A ticked Definition of Done without recorded evidence does not close a story. An acceptance case with no recorded result is treated as failed, not as passed by default.

**An epic is `Done` only when** every story under it is `Done`, all mapped acceptance cases have passed, and no story remains `Blocked` or deferred without a written, accepted decision.

---

## Epic summary

| Epic | Title | Stories | Points | Complete | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [EPIC-01](epics/EPIC-01-tenancy-foundation.md) | Tenancy Foundation | 4 | 24 | 0 / 4 | `Not Started` |
| [EPIC-02](epics/EPIC-02-configuration-dimensions-and-limits.md) | Configuration, Dimensions and Limits | 6 | 34 | 0 / 6 | `Not Started` |
| [EPIC-03](epics/EPIC-03-counter-engine.md) | Counter Engine | 7 | 45 | 0 / 7 | `Not Started` |
| [EPIC-04](epics/EPIC-04-transaction-validation-and-idempotency.md) | Transaction Validation and Idempotency | 6 | 39 | 0 / 6 | `Not Started` |
| [EPIC-05](epics/EPIC-05-reversal-and-reconciliation.md) | Reversal and Reconciliation | 2 | 16 | 0 / 2 | `Not Started` |
| [EPIC-06](epics/EPIC-06-operations-resilience-and-compliance.md) | Operations, Resilience and Compliance | 4 | 23 | 0 / 4 | `Not Started` |
| [EPIC-07](epics/EPIC-07-performance-and-acceptance-certification.md) | Performance and Acceptance Certification | 3 | 18 | 0 / 3 | `Not Started` |
| [EPIC-08](epics/EPIC-08-direction-scoping-and-inward-readiness.md) | Direction Scoping and INWARD Readiness | 6 | 34 | 0 / 6 | `Not Started` |

---

## Suggested delivery sequence

The dependency chain is real, not advisory. Tenancy is the foundation because retrofitting a client identifier into counter keys and the idempotency index later is a data migration, not a refactor.

1. **EPIC-01** then **EPIC-02** — nothing can be client-scoped correctly until the tenant and its configuration exist.
2. **EPIC-03** — the counter engine, with STORY-03-03 and STORY-03-06 carrying the correctness fixes.
3. **EPIC-04** — the request path, with STORY-04-01 closing the double-count race.
4. **EPIC-05** and **EPIC-06** — reversal, reconciliation and operations, which can run in parallel once the engine is stable.
5. **EPIC-07** — certification last, since it proves the whole.

**EPIC-08 is not last.** Its two structural stories, STORY-08-01 and STORY-08-02, must land **alongside EPIC-03 and EPIC-04**, because the direction segment belongs in the counter key and the transaction identity before any counter data exists. The remaining direction stories can follow at leisure, but those two cannot be deferred without creating a migration.

---

## Critical-path stories

These three carry the defect fixes identified in the BRD review. Regression coverage on them is mandatory rather than discretionary.

| Story | Why it is critical |
| :--- | :--- |
| [STORY-03-03](stories/STORY-03-03-tier-1-bootstrap-plus-guarded-conditional-increment.md) | A guarded update combined with upsert turns a genuine breach into a duplicate key error, which the retry policy then misreads as a transient fault. |
| [STORY-03-06](stories/STORY-03-06-rolling-window-as-a-single-document-with-pipeline-update.md) | A rolling total spread across separate documents cannot be enforced strictly. This story is what makes the per-entity rolling guarantee real. |
| [STORY-04-01](stories/STORY-04-01-pending-claim-idempotency-mutex.md) | Without a claim written before validation, two concurrent retries both run the waterfall and both increment counters. |
| [STORY-08-02](stories/STORY-08-02-direction-segment-in-counter-keys-and-transaction-identity.md) | The direction segment must enter the counter key and transaction identity while no data exists. Deferring it turns INWARD into a re-keying migration of every counter. |

---

## Open items blocking specific stories

These are unresolved inputs from the BRD, not engineering decisions. Each blocks the story named.

| Open item | Blocks | Owner |
| :--- | :--- | :--- |
| Client authentication mechanism (API key, mTLS or OAuth) | STORY-01-02 | Security |
| Statutory record retention term | STORY-06-01 | Compliance |
| Field-level encryption decision for customer and account identifiers | STORY-06-04 | Compliance and Security |
| Recovery time and recovery point objectives, and DR topology | STORY-06-03 | Infrastructure |
| MongoDB 5.0 or later confirmed in every environment | STORY-03-06 | Infrastructure |
| Whether the 1000 RPS target is per direction or combined | STORY-08-06 | Business and Infrastructure |
| Inward dimension set and the source of its attributes | STORY-08-03 | Business and Risk |
| Whether any combined total-throughput control is required | STORY-08-04 | Risk |

---

## Story tracker

### EPIC-01 — Tenancy Foundation

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-01-01](stories/STORY-01-01-client-registry-collection-and-admin-crud.md) | Client registry collection and admin CRUD | Must | 5 | UAT 28 | `Not Started` | | |
| [STORY-01-02](stories/STORY-01-02-client-authentication-and-clientid-derivation.md) | Client authentication and clientId derivation | Must | 8 | UAT 26, UAT 27 | `Not Started` | | |
| [STORY-01-03](stories/STORY-01-03-tenant-isolation-across-all-data-access.md) | Tenant isolation across all data access | Must | 8 | UAT 23, UAT 24 | `Not Started` | | |
| [STORY-01-04](stories/STORY-01-04-client-lifecycle-and-fail-closed-gating.md) | Client lifecycle and fail-closed gating | Must | 3 | UAT 26 | `Not Started` | | |

### EPIC-02 — Configuration, Dimensions and Limits

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-02-01](stories/STORY-02-01-per-client-dimension-registry-with-validated-snapshot-loading.md) | Per-client dimension registry with validated snapshot loading | Must | 8 | UAT 25 | `Not Started` | | |
| [STORY-02-02](stories/STORY-02-02-per-dimension-window-declaration.md) | Per-dimension window declaration | Must | 5 | UAT 41, UAT 42 | `Not Started` | | |
| [STORY-02-03](stories/STORY-02-03-window-activation-timing-and-warming-state.md) | Window activation timing and warming state | Must | 5 | UAT 43 | `Not Started` | | |
| [STORY-02-04](stories/STORY-02-04-limit-definition-crud-with-versioning-and-audit.md) | Limit definition CRUD with versioning and audit | Must | 8 | UAT 11, UAT 16, UAT 39 | `Not Started` | | |
| [STORY-02-05](stories/STORY-02-05-inert-definition-warnings-and-effective-flag.md) | Inert definition warnings and effective flag | Should | 3 | UAT 15, UAT 41 | `Not Started` | | |
| [STORY-02-06](stories/STORY-02-06-in-process-definition-and-registry-cache-with-invalidation.md) | In-process definition and registry cache with invalidation | Must | 5 | UAT 11 | `Not Started` | | |

### EPIC-03 — Counter Engine

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-03-01](stories/STORY-03-01-counter-key-builder-document-model-and-ttl-cleanup.md) | Counter key builder, document model and TTL cleanup | Must | 5 | UAT 21 | `Not Started` | | |
| [STORY-03-02](stories/STORY-03-02-tier-0-stateless-per-transaction-check.md) | Tier 0 stateless per-transaction check | Must | 3 | UAT 12, UAT 13, UAT 33 | `Not Started` | | |
| [STORY-03-03](stories/STORY-03-03-tier-1-bootstrap-plus-guarded-conditional-increment.md) | Tier 1 bootstrap plus guarded conditional increment | Must | 8 | UAT 29, UAT 33 | `Not Started` | | |
| [STORY-03-04](stories/STORY-03-04-tier-2-sharded-counters-with-cached-totals.md) | Tier 2 sharded counters with cached totals | Must | 8 | UAT 19, UAT 20, UAT 22 | `Not Started` | | |
| [STORY-03-05](stories/STORY-03-05-safe-shard-factor-change-semantics.md) | Safe shard factor change semantics | Must | 5 | UAT 34 | `Not Started` | | |
| [STORY-03-06](stories/STORY-03-06-rolling-window-as-a-single-document-with-pipeline-update.md) | Rolling window as a single document with pipeline update | Must | 13 | UAT 31, UAT 32, UAT 1 | `Not Started` | | |
| [STORY-03-07](stories/STORY-03-07-read-preference-and-write-concern-policy.md) | Read preference and write concern policy | Must | 3 | UAT 37 | `Not Started` | | |

### EPIC-04 — Transaction Validation and Idempotency

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-04-01](stories/STORY-04-01-pending-claim-idempotency-mutex.md) | Pending claim idempotency mutex | Must | 8 | UAT 8, UAT 30 | `Not Started` | | |
| [STORY-04-02](stories/STORY-04-02-stale-pending-claim-reaper.md) | Stale pending claim reaper | Must | 5 | UAT 35 | `Not Started` | | |
| [STORY-04-03](stories/STORY-04-03-config-driven-validation-waterfall.md) | Config-driven validation waterfall | Must | 8 | UAT 6, UAT 7, UAT 14, UAT 18 | `Not Started` | | |
| [STORY-04-04](stories/STORY-04-04-compensating-saga-with-correct-retry-classification.md) | Compensating saga with correct retry classification | Must | 8 | UAT 3, UAT 4 | `Not Started` | | |
| [STORY-04-05](stories/STORY-04-05-audit-record-and-rejection-detail-capture.md) | Audit record and rejection detail capture | Must | 5 | UAT 2 | `Not Started` | | |
| [STORY-04-06](stories/STORY-04-06-client-timezone-windows-and-clock-skew-control.md) | Client timezone windows and clock skew control | Must | 5 | UAT 40 | `Not Started` | | |

### EPIC-05 — Reversal and Reconciliation

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-05-01](stories/STORY-05-01-reversal-api-with-ordering-and-floor-guards.md) | Reversal API with ordering and floor guards | Must | 8 | UAT 9, UAT 10, UAT 17, UAT 44 | `Not Started` | | |
| [STORY-05-02](stories/STORY-05-02-counter-reconciliation-sweeper.md) | Counter reconciliation sweeper | Must | 8 | UAT 36 | `Not Started` | | |

### EPIC-06 — Operations, Resilience and Compliance

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-06-01](stories/STORY-06-01-audit-retention-archival-and-collection-sharding.md) | Audit retention, archival and collection sharding | Must | 8 | None (operational) | `Not Started` | | |
| [STORY-06-02](stories/STORY-06-02-observability-and-alerting.md) | Observability and alerting | Must | 5 | None (operational) | `Not Started` | | |
| [STORY-06-03](stories/STORY-06-03-fail-closed-degradation-and-disaster-recovery-posture.md) | Fail-closed degradation and disaster recovery posture | Must | 5 | UAT 38 | `Not Started` | | |
| [STORY-06-04](stories/STORY-06-04-data-protection-and-access-control.md) | Data protection and access control | Must | 5 | None (compliance) | `Not Started` | | |

### EPIC-07 — Performance and Acceptance Certification

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-07-01](stories/STORY-07-01-sustained-throughput-and-latency-certification.md) | Sustained throughput and latency certification | Must | 8 | UAT 5 | `Not Started` | | |
| [STORY-07-02](stories/STORY-07-02-hot-counter-concurrency-certification.md) | Hot counter concurrency certification | Must | 5 | UAT 19, UAT 22 | `Not Started` | | |
| [STORY-07-03](stories/STORY-07-03-formal-uat-execution-pack.md) | Formal UAT execution pack | Must | 5 | UAT 1 to UAT 44 | `Not Started` | | |

### EPIC-08 — Direction Scoping and INWARD Readiness

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| [STORY-08-01](stories/STORY-08-01-direction-resolution-validation-and-fail-closed-gating.md) | Direction resolution validation and fail-closed gating | Must | 5 | UAT 49 | `Not Started` | | |
| [STORY-08-02](stories/STORY-08-02-direction-segment-in-counter-keys-and-transaction-identity.md) | Direction segment in counter keys and transaction identity | Must | 8 | UAT 45, UAT 50 | `Not Started` | | |
| [STORY-08-03](stories/STORY-08-03-per-direction-dimension-registry-with-backward-compatible-loading.md) | Per-direction dimension registry with backward compatible loading | Must | 8 | UAT 46, UAT 52 | `Not Started` | | |
| [STORY-08-04](stories/STORY-08-04-combined-direction-scope-for-total-throughput-controls.md) | Combined direction scope for total throughput controls | Should | 5 | UAT 47, UAT 48 | `Not Started` | | |
| [STORY-08-05](stories/STORY-08-05-direction-scoped-configuration-apis-and-inert-inward-policy.md) | Direction-scoped configuration APIs and inert inward policy | Must | 5 | UAT 51 | `Not Started` | | |
| [STORY-08-06](stories/STORY-08-06-inward-capacity-and-sizing-assessment.md) | INWARD capacity and sizing assessment | Must | 3 | None (planning) | `Not Started` | | |
