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
| **EPIC-01** | Tenancy Foundation | 4 | 24 | 0 / 4 | `Not Started` |
| **EPIC-02** | Configuration, Dimensions and Limits | 6 | 34 | 0 / 6 | `Not Started` |
| **EPIC-03** | Counter Engine | 7 | 45 | 0 / 7 | `Not Started` |
| **EPIC-04** | Transaction Validation and Idempotency | 6 | 39 | 0 / 6 | `Not Started` |
| **EPIC-05** | Reversal and Reconciliation | 2 | 16 | 0 / 2 | `Not Started` |
| **EPIC-06** | Operations, Resilience and Compliance | 4 | 23 | 0 / 4 | `Not Started` |
| **EPIC-07** | Performance and Acceptance Certification | 3 | 18 | 0 / 3 | `Not Started` |
| **EPIC-08** | Direction Scoping and INWARD Readiness | 6 | 34 | 0 / 6 | `Not Started` |

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
| **STORY-03-03** | A guarded update combined with upsert turns a genuine breach into a duplicate key error, which the retry policy then misreads as a transient fault. |
| **STORY-03-06** | A rolling total spread across separate documents cannot be enforced strictly. This story is what makes the per-entity rolling guarantee real. |
| **STORY-04-01** | Without a claim written before validation, two concurrent retries both run the waterfall and both increment counters. |
| **STORY-08-02** | The direction segment must enter the counter key and transaction identity while no data exists. Deferring it turns INWARD into a re-keying migration of every counter. |

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
| **STORY-01-01** | Client registry collection and admin CRUD | Must | 5 | UAT 28 | `Not Started` | | |
| **STORY-01-02** | Client authentication and clientId derivation | Must | 8 | UAT 26, UAT 27 | `Not Started` | | |
| **STORY-01-03** | Tenant isolation across all data access | Must | 8 | UAT 23, UAT 24 | `Not Started` | | |
| **STORY-01-04** | Client lifecycle and fail-closed gating | Must | 3 | UAT 26 | `Not Started` | | |

### EPIC-02 — Configuration, Dimensions and Limits

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STORY-02-01** | Per-client dimension registry with validated snapshot loading | Must | 8 | UAT 25 | `Not Started` | | |
| **STORY-02-02** | Per-dimension window declaration | Must | 5 | UAT 41, UAT 42 | `Not Started` | | |
| **STORY-02-03** | Window activation timing and warming state | Must | 5 | UAT 43 | `Not Started` | | |
| **STORY-02-04** | Limit definition CRUD with versioning and audit | Must | 8 | UAT 11, UAT 16, UAT 39 | `Not Started` | | |
| **STORY-02-05** | Inert definition warnings and effective flag | Should | 3 | UAT 15, UAT 41 | `Not Started` | | |
| **STORY-02-06** | In-process definition and registry cache with invalidation | Must | 5 | UAT 11 | `Not Started` | | |

### EPIC-03 — Counter Engine

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STORY-03-01** | Counter key builder, document model and TTL cleanup | Must | 5 | UAT 21 | `Not Started` | | |
| **STORY-03-02** | Tier 0 stateless per-transaction check | Must | 3 | UAT 12, UAT 13, UAT 33 | `Not Started` | | |
| **STORY-03-03** | Tier 1 bootstrap plus guarded conditional increment | Must | 8 | UAT 29, UAT 33 | `Not Started` | | |
| **STORY-03-04** | Tier 2 sharded counters with cached totals | Must | 8 | UAT 19, UAT 20, UAT 22 | `Not Started` | | |
| **STORY-03-05** | Safe shard factor change semantics | Must | 5 | UAT 34 | `Not Started` | | |
| **STORY-03-06** | Rolling window as a single document with pipeline update | Must | 13 | UAT 31, UAT 32, UAT 1 | `Not Started` | | |
| **STORY-03-07** | Read preference and write concern policy | Must | 3 | UAT 37 | `Not Started` | | |

### EPIC-04 — Transaction Validation and Idempotency

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STORY-04-01** | Pending claim idempotency mutex | Must | 8 | UAT 8, UAT 30 | `Not Started` | | |
| **STORY-04-02** | Stale pending claim reaper | Must | 5 | UAT 35 | `Not Started` | | |
| **STORY-04-03** | Config-driven validation waterfall | Must | 8 | UAT 6, UAT 7, UAT 14, UAT 18 | `Not Started` | | |
| **STORY-04-04** | Compensating saga with correct retry classification | Must | 8 | UAT 3, UAT 4 | `Not Started` | | |
| **STORY-04-05** | Audit record and rejection detail capture | Must | 5 | UAT 2 | `Not Started` | | |
| **STORY-04-06** | Client timezone windows and clock skew control | Must | 5 | UAT 40 | `Not Started` | | |

### EPIC-05 — Reversal and Reconciliation

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STORY-05-01** | Reversal API with ordering and floor guards | Must | 8 | UAT 9, UAT 10, UAT 17, UAT 44 | `Not Started` | | |
| **STORY-05-02** | Counter reconciliation sweeper | Must | 8 | UAT 36 | `Not Started` | | |

### EPIC-06 — Operations, Resilience and Compliance

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STORY-06-01** | Audit retention, archival and collection sharding | Must | 8 | None (operational) | `Not Started` | | |
| **STORY-06-02** | Observability and alerting | Must | 5 | None (operational) | `Not Started` | | |
| **STORY-06-03** | Fail-closed degradation and disaster recovery posture | Must | 5 | UAT 38 | `Not Started` | | |
| **STORY-06-04** | Data protection and access control | Must | 5 | None (compliance) | `Not Started` | | |

### EPIC-07 — Performance and Acceptance Certification

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STORY-07-01** | Sustained throughput and latency certification | Must | 8 | UAT 5 | `Not Started` | | |
| **STORY-07-02** | Hot counter concurrency certification | Must | 5 | UAT 19, UAT 22 | `Not Started` | | |
| **STORY-07-03** | Formal UAT execution pack | Must | 5 | UAT 1 to UAT 44 | `Not Started` | | |

### EPIC-08 — Direction Scoping and INWARD Readiness

| Story | Title | Pri | Est | Acceptance cases | Status | Completed on | Verified by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STORY-08-01** | Direction resolution validation and fail-closed gating | Must | 5 | UAT 49 | `Not Started` | | |
| **STORY-08-02** | Direction segment in counter keys and transaction identity | Must | 8 | UAT 45, UAT 50 | `Not Started` | | |
| **STORY-08-03** | Per-direction dimension registry with backward compatible loading | Must | 8 | UAT 46, UAT 52 | `Not Started` | | |
| **STORY-08-04** | Combined direction scope for total throughput controls | Should | 5 | UAT 47, UAT 48 | `Not Started` | | |
| **STORY-08-05** | Direction-scoped configuration APIs and inert inward policy | Must | 5 | UAT 51 | `Not Started` | | |
| **STORY-08-06** | INWARD capacity and sizing assessment | Must | 3 | None (planning) | `Not Started` | | |


---

# Amendments to existing stories — BRD v7.0 (direction scoping)

Direction is a cross-cutting scoping axis, so several already-written stories gain
acceptance criteria rather than being replaced. Apply these before starting the story.
EPIC-08 holds the work that is genuinely new.

| Story | Amendment required |
| :--- | :--- |
| STORY-01-01 | The client record gains `enabledDirections`. A direction cannot be enabled without a valid registry for it. |
| STORY-01-03 | Isolation guard extends from a client predicate to a client-and-direction predicate on counter and transaction access. |
| STORY-02-01 | Registry snapshot becomes a map keyed by direction. Both directions swap in one atomic operation so versions cannot diverge. |
| STORY-02-02 | Windows are declared per direction. The same dimension code may declare different windows in each direction. |
| STORY-02-04 | Limit definitions carry an immutable `direction`. CRUD paths become direction-scoped. |
| STORY-02-05 | Inert-definition warnings gain a third cause: the direction is not enabled. |
| STORY-02-06 | Definition and registry caches key on the client-and-direction pair. |
| STORY-03-01 | Counter key builder inserts the direction segment immediately after the client identifier. |
| STORY-03-02 | The mandatory global per-transaction cap is mandatory **per enabled direction**. |
| STORY-03-04 | `hot` and `shardFactor` are declared per direction. A combined dimension is sized against the summed rate of both. |
| STORY-04-01 | Transaction primary key becomes the client, direction and transaction identifier triple. |
| STORY-04-03 | The waterfall iterates the dimensions declared for that client **and direction** only. |
| STORY-04-05 | Audit records carry direction, and each applied counter key records the direction segment used. |
| STORY-05-01 | Reversal input gains direction. Combined counters are decremented on their shared neutral key. |
| STORY-05-02 | Reconciliation derives counters per client and direction, and handles the shared combined key separately. |
| STORY-06-01 | Retention sizing is recalculated with inward volume included before inward is enabled. |
| STORY-06-02 | Metrics are dimensioned by direction as well as by client, dimension and window. |
| STORY-07-01 | Load certification states whether the target is per direction or combined. |
| STORY-07-03 | The acceptance pack extends to cover UAT 45 through UAT 52. |


---

# Part 2 — Epic Detail


---

# EPIC-01 — Tenancy Foundation

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 4 |
| **Total estimate (pts)** | 24 |
| **Completed** | 0 / 4 |

## Goal

Establish the client as a first-class tenant so every downstream feature is client-scoped from the first line of code, and onboarding a second client is a data operation rather than a migration.

## Definition of success

A request cannot reach the validation engine without a resolved, authenticated, ACTIVE `clientId`, and no query anywhere in the codebase can read or write data without that `clientId` in its predicate.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-01-01** | Client registry collection and admin CRUD | Must | 5 | `Not Started` |
| **STORY-01-02** | Client authentication and clientId derivation | Must | 8 | `Not Started` |
| **STORY-01-03** | Tenant isolation across all data access | Must | 8 | `Not Started` |
| **STORY-01-04** | Client lifecycle and fail-closed gating | Must | 3 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# EPIC-02 — Configuration, Dimensions and Limits

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 6 |
| **Total estimate (pts)** | 34 |
| **Completed** | 0 / 6 |

## Goal

Deliver the per-client registry and limit-definition management that let dimensions, windows and thresholds change under review without a code change.

## Definition of success

A reviewer can read one client's configuration and know exactly which dimension and window pairs are enforced and at what cost per transaction, and a product change to a threshold takes effect without a deployment.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-02-01** | Per-client dimension registry with validated snapshot loading | Must | 8 | `Not Started` |
| **STORY-02-02** | Per-dimension window declaration | Must | 5 | `Not Started` |
| **STORY-02-03** | Window activation timing and warming state | Must | 5 | `Not Started` |
| **STORY-02-04** | Limit definition CRUD with versioning and audit | Must | 8 | `Not Started` |
| **STORY-02-05** | Inert definition warnings and effective flag | Should | 3 | `Not Started` |
| **STORY-02-06** | In-process definition and registry cache with invalidation | Must | 5 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# EPIC-03 — Counter Engine

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 7 |
| **Total estimate (pts)** | 45 |
| **Completed** | 0 / 7 |

## Goal

Implement the MongoDB-only velocity counter store that sustains 1000 RPS including a single logical counter incremented up to 1000 times per second, with the strictness each tier promises.

## Definition of success

Every counter tier behaves exactly as Section 5 of the BRD claims: Tier 0 exact, Tier 1 and the per-entity rolling window strict and race-free, Tier 2 approximate within a bounded and measured overshoot.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-03-01** | Counter key builder, document model and TTL cleanup | Must | 5 | `Not Started` |
| **STORY-03-02** | Tier 0 stateless per-transaction check | Must | 3 | `Not Started` |
| **STORY-03-03** | Tier 1 bootstrap plus guarded conditional increment | Must | 8 | `Not Started` |
| **STORY-03-04** | Tier 2 sharded counters with cached totals | Must | 8 | `Not Started` |
| **STORY-03-05** | Safe shard factor change semantics | Must | 5 | `Not Started` |
| **STORY-03-06** | Rolling window as a single document with pipeline update | Must | 13 | `Not Started` |
| **STORY-03-07** | Read preference and write concern policy | Must | 3 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# EPIC-04 — Transaction Validation and Idempotency

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 6 |
| **Total estimate (pts)** | 39 |
| **Completed** | 0 / 6 |

## Goal

Deliver the request path: claim the transaction, run the config-driven waterfall across declared dimensions and windows, and compensate correctly on breach or failure.

## Definition of success

A duplicate or retried transaction can never double-count a counter, a breach is always a fast clean rejection, and every decision is explainable from its audit record.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-04-01** | Pending claim idempotency mutex | Must | 8 | `Not Started` |
| **STORY-04-02** | Stale pending claim reaper | Must | 5 | `Not Started` |
| **STORY-04-03** | Config-driven validation waterfall | Must | 8 | `Not Started` |
| **STORY-04-04** | Compensating saga with correct retry classification | Must | 8 | `Not Started` |
| **STORY-04-05** | Audit record and rejection detail capture | Must | 5 | `Not Started` |
| **STORY-04-06** | Client timezone windows and clock skew control | Must | 5 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# EPIC-05 — Reversal and Reconciliation

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 2 |
| **Total estimate (pts)** | 16 |
| **Completed** | 0 / 2 |

## Goal

Reconcile this system's state with downstream IMPS outcomes, and provide the backstop that repairs counter drift when compensation itself fails.

## Definition of success

An approved transaction that fails downstream returns its consumed velocity to the customer, and no counter can stay permanently wrong without being detected.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-05-01** | Reversal API with ordering and floor guards | Must | 8 | `Not Started` |
| **STORY-05-02** | Counter reconciliation sweeper | Must | 8 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# EPIC-06 — Operations, Resilience and Compliance

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 4 |
| **Total estimate (pts)** | 23 |
| **Completed** | 0 / 4 |

## Goal

Make the system operable and auditable at 1000 RPS, with the retention, protection and failure behaviour a financial risk gate requires.

## Definition of success

The service fails closed under every degraded condition, its data growth is planned rather than discovered, and an auditor can trace any historical decision.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-06-01** | Audit retention, archival and collection sharding | Must | 8 | `Not Started` |
| **STORY-06-02** | Observability and alerting | Must | 5 | `Not Started` |
| **STORY-06-03** | Fail-closed degradation and disaster recovery posture | Must | 5 | `Not Started` |
| **STORY-06-04** | Data protection and access control | Must | 5 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# EPIC-07 — Performance and Acceptance Certification

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 3 |
| **Total estimate (pts)** | 18 |
| **Completed** | 0 / 3 |

## Goal

Prove the system meets its stated throughput, latency and correctness guarantees under realistic load, and formally execute the BRD acceptance criteria.

## Definition of success

The 1000 RPS target and the sub-100ms internal budget are demonstrated rather than assumed, and every BRD acceptance case has a recorded pass.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-07-01** | Sustained throughput and latency certification | Must | 8 | `Not Started` |
| **STORY-07-02** | Hot counter concurrency certification | Must | 5 | `Not Started` |
| **STORY-07-03** | Formal UAT execution pack | Must | 5 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# EPIC-08 — Direction Scoping and INWARD Readiness

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 6 |
| **Total estimate (pts)** | 34 |
| **Completed** | 0 / 6 |

## Goal

Introduce transaction direction as a second scoping axis so that OUTWARD ships today and INWARD later becomes a configuration and attribute-extraction exercise rather than a re-keying migration.

## Definition of success

Direction is present in every counter key, transaction identity and audit record while only OUTWARD traffic exists, each direction carries its own dimension registry, and an inward policy can be authored and reviewed before inward traffic is switched on.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| **STORY-08-01** | Direction resolution validation and fail-closed gating | Must | 5 | `Not Started` |
| **STORY-08-02** | Direction segment in counter keys and transaction identity | Must | 8 | `Not Started` |
| **STORY-08-03** | Per-direction dimension registry with backward compatible loading | Must | 8 | `Not Started` |
| **STORY-08-04** | Combined direction scope for total throughput controls | Should | 5 | `Not Started` |
| **STORY-08-05** | Direction-scoped configuration APIs and inert inward policy | Must | 5 | `Not Started` |
| **STORY-08-06** | INWARD capacity and sizing assessment | Must | 3 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision


---

# Part 3 — Story Detail


---

# STORY-01-01 — Client registry collection and admin CRUD

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-01 — Tenancy Foundation** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 2.1.2, 4.4 |
| **BRD UAT mapping** | UAT 28 |
| **Depends on** | None |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Create the `clients` collection and the admin-only endpoints to onboard and manage tenants. A client record carries its identity, status, authentication binding and timezone. This is the root of the tenancy model, so it lands before anything that consumes a `clientId`.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an admin caller with the admin role | they POST a valid client payload to /clients | the client is persisted with status ACTIVE, a unique clientId, and createdBy or createdAt audit fields populated |
| 2 | an existing clientId | an admin POSTs the same clientId again | the request is rejected with a conflict error and no second record is created |
| 3 | a caller holding only a tenant role (not admin) | they call any /clients endpoint | the request is rejected as unauthorised and no client data is returned |
| 4 | a client payload with an invalid IANA timezone | an admin submits it | validation rejects it and names the offending field |
| 5 | an existing client | an admin PATCHes status to SUSPENDED | the change is persisted and written to the configuration audit trail with actor and timestamp |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Admin role is enforced by a separate credential from tenant API credentials

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Integration test run | CI job link showing the client CRUD suite green | | |
| Role separation proven | Test output showing a tenant-role token rejected on /clients | | |
| Audit trail | Sample audit record for a status change, showing actor and before/after | | |

## Notes / Risks

Onboarding a client is also gated by STORY-02-01 (registry snapshot). A client with no registry must not be usable.


---

# STORY-01-02 — Client authentication and clientId derivation

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-01 — Tenancy Foundation** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 2.1.1 |
| **BRD UAT mapping** | UAT 26, UAT 27 |
| **Depends on** | STORY-01-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Derive `clientId` from the authenticated principal (API key, mTLS certificate or OAuth client credential), never from a request body field. This is the load-bearing control for tenant isolation. If a payload also carries a clientId it must match the principal, otherwise the request is rejected.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a valid authenticated principal bound to a registered client | any transaction or config request arrives | the engine resolves the clientId from the principal and proceeds |
| 2 | a request whose payload clientId differs from the authenticated principal | the request is submitted | it is rejected before validation, with no counter access and no audit mutation for either client |
| 3 | a request with no credential or an unrecognised credential | the request is submitted | it is rejected as unauthenticated and no clientId is resolved |
| 4 | a credential whose binding has been rotated or revoked | the request is submitted | it is rejected and the rejection is logged with the credential fingerprint but not the secret |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Credentials and certificate fingerprints never appear in application logs

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Spoof test | Test output for UAT 27 showing payload/principal mismatch rejected | | |
| Security review | Sign-off from the security reviewer on the auth binding mechanism | | |
| Log inspection | Confirmation that no secret material appears in logs at any level | | |

## Notes / Risks

The choice of mechanism (API key vs mTLS vs OAuth) is an open item in the BRD and must be confirmed with the bank before this story starts.


---

# STORY-01-03 — Tenant isolation across all data access

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-01 — Tenancy Foundation** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 2.1.3, 4.2 |
| **BRD UAT mapping** | UAT 23, UAT 24 |
| **Depends on** | STORY-01-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Enforce that every collection carries a clientId discriminator and that every query, key and index leads with clientId. Implement this as a shared data-access layer so isolation is structural rather than a rule each developer must remember.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | two clients with identical dimension codes and identical transaction identifiers | both submit traffic concurrently | their counters, limits and audit records remain fully independent and neither client's velocity is affected by the other |
| 2 | a caller authenticated as client A | they request a resource path naming client B | the request is rejected with no data returned and no mutation performed |
| 3 | any repository method in the codebase | a static or runtime check inspects the query predicate | the predicate contains a clientId term, and a query without one fails fast rather than returning cross-tenant data |
| 4 | client A approved a transaction | client A reverses it | only client A counters are decremented and client B counters are untouched |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] A guard rejects any query built without a clientId predicate, verified by test

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Isolation test | UAT 23 result showing independent counters under concurrent two-client load | | |
| Access denial test | UAT 24 result showing cross-tenant read and write both refused | | |
| Guard proof | Test showing a deliberately clientId-less query is rejected at runtime | | |

## Notes / Risks

_None recorded._


---

# STORY-01-04 — Client lifecycle and fail-closed gating

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-01 — Tenancy Foundation** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 2.1.1, 2.1.2, 4.9 |
| **BRD UAT mapping** | UAT 26 |
| **Depends on** | STORY-01-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Reject traffic from unknown, inactive or suspended clients before any validation or counter access. This is the first fail-closed gate in the request path and must be unconditional.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an unregistered clientId | a transaction is submitted | the request is rejected before any counter read or write occurs |
| 2 | a client whose status is SUSPENDED | a transaction is submitted | the request is rejected and no counter is touched |
| 3 | a client suspended while requests are in flight | the next request arrives | it is rejected using the refreshed status without requiring a service restart |
| 4 | a suspended client that is reactivated | a transaction is submitted | it is processed normally against its existing counters |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Fail-closed test | UAT 26 result covering unknown and suspended clients | | |
| No side-effect proof | Counter documents unchanged after rejected requests, shown by before/after query | | |

## Notes / Risks

_None recorded._


---

# STORY-02-01 — Per-client dimension registry with validated snapshot loading

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-02 — Configuration, Dimensions and Limits** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.3 |
| **BRD UAT mapping** | UAT 25 |
| **Depends on** | STORY-01-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Implement the per-client allowed-dimensions registry as an immutable, versioned snapshot, loaded and atomically swapped in-process per client. Validation must reject a structurally invalid configuration rather than allowing it to silently alter enforcement.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | two clients with different registries | each submits traffic | each client enforces only the dimensions declared in its own registry |
| 2 | a registry missing the GLOBAL dimension | it is submitted for that client | validation rejects it and the previously loaded snapshot stays in force |
| 3 | a registry declaring an attribute the engine cannot extract | it is submitted | validation rejects it and names the offending dimension and attribute |
| 4 | a valid new registry version | it is activated | the in-process snapshot is swapped atomically and no in-flight request sees a partially applied configuration |
| 5 | client A registry is changed | client B traffic continues | client B loaded snapshot is unaffected |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Snapshot objects are immutable after load, enforced by type or test

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Per-client enforcement | UAT 25 result showing two clients with divergent registries | | |
| Validation matrix | Test output covering each rejection rule | | |
| Atomic swap proof | Concurrency test showing no request observes a mixed-version snapshot | | |

## Notes / Risks

_None recorded._


---

# STORY-02-02 — Per-dimension window declaration

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-02 — Configuration, Dimensions and Limits** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.3.1, 2.3 |
| **BRD UAT mapping** | UAT 41, UAT 42 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Each dimension declares the set of time windows it enforces, as a map keyed by window type whose values carry optional per-window overrides. A dimension needing both daily windows lists both. PER_TXN is stateless and is implicitly enabled for every dimension, so it is never declared and can never be de-activated by a registry edit.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a dimension declaring only the calendar daily window | a rolling limit definition exists for it | no rolling counter is created, no rolling write occurs, and enforcement ignores the definition entirely |
| 2 | a dimension declaring both daily windows with different thresholds | a transaction breaches either one | the transaction is rejected, and each window rejects independently of the other |
| 3 | a dimension declaring only one daily window | a transaction is evaluated | the daily check runs against that window alone without error |
| 4 | a registry supplying windows as a plain array of window types | it is loaded | the engine normalises it to the canonical map form with default overrides |
| 5 | any dimension in any registry | the engine evaluates a transaction | the per-transaction check is available without PER_TXN being declared in the windows map |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Registry validation rejects a dimension declaring no windows

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Window gating test | UAT 41 result showing an undeclared window produces no counter document | | |
| Dual-window test | UAT 42 result showing independent rejection on each daily window | | |
| Write-count proof | Instrumented run showing writes per transaction equals declared windows, not all window types | | |

## Notes / Risks

Declared windows are a direct cost multiplier. Each removed window is one fewer write on every transaction, so this story is also a latency lever.


---

# STORY-02-03 — Window activation timing and warming state

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-02 — Configuration, Dimensions and Limits** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.3.2 |
| **BRD UAT mapping** | UAT 43 |
| **Depends on** | STORY-02-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Activating a window mid-period is fail-open, because a newly activated rolling or monthly counter starts from zero and under-counts until its window fills. Activation is therefore boundary-aligned by default, with an explicit warming opt-in that flags every affected decision in the audit.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a new monthly window declared mid-month | the registry is activated | the window is marked pending activation and is not enforced until the next month boundary in the client timezone |
| 2 | a new daily window declared mid-day | the registry is activated | it is not enforced until the next midnight in the client timezone |
| 3 | a window activated with the explicit warming opt-in | a transaction is evaluated | the window is enforced immediately and the audit record for that decision carries the warming state flag |
| 4 | a declared window that has passed its activation boundary | a transaction is evaluated | the window is enforced normally with no warming flag |
| 5 | a window being de-activated | the registry change is applied | enforcement stops immediately, since removing enforcement is safe in the fail-closed direction |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Activation timing test | UAT 43 result for pending activation and boundary crossing | | |
| Warming audit sample | Audit record showing the warming state flag on a decision | | |
| Risk sign-off | Written acceptance from the risk owner that boundary-aligned activation is the default | | |

## Notes / Risks

This is the highest-risk configuration behaviour in the epic. It is the one place where a config edit could silently relax enforcement.


---

# STORY-02-04 — Limit definition CRUD with versioning and audit

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-02 — Configuration, Dimensions and Limits** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.4, 2.3.3 |
| **BRD UAT mapping** | UAT 11, UAT 16, UAT 39 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Client-scoped CRUD for limit definitions, including scope overrides, effective dating, definition versioning and an immutable configuration audit trail. Thresholds are inclusive maxima and a mid-window change does not re-base already accumulated velocity.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an existing limit definition | it is updated through the API | subsequent transactions are evaluated against the new threshold without a service restart |
| 2 | a scope override pinned to specific attribute values and a wildcard default for the same dimension | a transaction matches the pinned values | the scope override threshold takes precedence over the default |
| 3 | a threshold lowered below a customer already accumulated velocity | the next transaction in that window arrives | it is rejected, and the audit record names the new definition version in force |
| 4 | any create, update or delete on a definition | the write completes | an immutable audit entry records actor, timestamp, before and after values, and the new definition version |
| 5 | a definition with an effective-from date in the future | a transaction is evaluated before that date | the definition is not applied |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Amounts are stored and compared as integers in minor units with no floating point anywhere in the path

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| CRUD effect test | UAT 11 result showing changes take effect with no restart | | |
| Precedence test | UAT 16 result for scope override over wildcard default | | |
| Threshold change test | UAT 39 result including the recorded definition version | | |
| Audit sample | Configuration audit entry for one update | | |

## Notes / Risks

_None recorded._


---

# STORY-02-05 — Inert definition warnings and effective flag

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-02 — Configuration, Dimensions and Limits** |
| **Status** | `Not Started` |
| **Priority** | Should |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.4 |
| **BRD UAT mapping** | UAT 15, UAT 41 |
| **Depends on** | STORY-02-02, STORY-02-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

A limit definition can now be inert for two distinct reasons: the dimension is not registered, or the window is not declared for that dimension. Silently accepting a limit that will never fire is the failure mode this story prevents.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a definition for a dimension not present in the client registry | it is created through the API | the write succeeds and the response carries a non-blocking warning naming the closed gate |
| 2 | a definition for a window not declared on an otherwise registered dimension | it is created | the write succeeds and the warning names the window gate specifically, not just the dimension |
| 3 | a list request for a client definitions | the response is returned | each definition carries an effective flag reflecting whether it is currently enforced |
| 4 | an inert definition whose gate is subsequently opened in the registry | a transaction is evaluated | the definition becomes effective without being re-submitted |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Warning content test | API response samples for both inert causes | | |
| Activation test | UAT 15 result showing a definition becoming effective when its gate opens | | |

## Notes / Risks

_None recorded._


---

# STORY-02-06 — In-process definition and registry cache with invalidation

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-02 — Configuration, Dimensions and Limits** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.3, 4.4, 4.1 |
| **BRD UAT mapping** | UAT 11 |
| **Depends on** | STORY-02-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Limit definitions and registry snapshots are cached in-process keyed by clientId and refreshed through a version bump or change-stream watch, so the transaction path never reads configuration from MongoDB. This is a hard requirement of the sub-100ms internal budget.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a service instance under transaction load | transactions are processed | no configuration read is issued to MongoDB on the transaction path, verified by query profiling |
| 2 | a limit definition updated on another instance | the change is committed | every instance reflects the change within the configured refresh interval without a restart |
| 3 | a cache refresh failure | the refresh attempt errors | the last known good snapshot stays in force, the failure is alerted, and enforcement is never disabled |
| 4 | multiple clients served by one instance | configuration is cached | cache entries are keyed by clientId and one client refresh does not evict or alter another client entry |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Profiler output | MongoDB profiler showing zero config reads during a load run | | |
| Propagation test | Measured time from a CRUD write to enforcement change across instances | | |
| Degradation test | Result showing last known good config retained on refresh failure | | |

## Notes / Risks

_None recorded._


---

# STORY-03-01 — Counter key builder, document model and TTL cleanup

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-03 — Counter Engine** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.2 |
| **BRD UAT mapping** | UAT 21 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Build counter document identifiers programmatically from the client registry, always leading with clientId, and rely on a TTL index for window cleanup so no application cleanup job is required.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a dimension with zero, one or several attributes | a counter key is built | the key is deterministic, leads with clientId, and concatenates attribute values in the order declared for that dimension |
| 2 | two clients with identical dimensions and identical attribute values | keys are built for both | the resulting keys differ and cannot collide |
| 3 | a calendar day or monthly counter whose window has passed | the TTL threshold elapses | the document is removed automatically with no application cleanup job running |
| 4 | a counter document being created | the write completes | clientId is present as a queryable field in addition to being embedded in the identifier |
| 5 | amounts written to a counter | values are stored | they are integers in minor units with no floating point representation |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Key determinism test | Unit test output covering zero, single and composite attribute dimensions | | |
| TTL test | UAT 21 result showing automatic removal after window expiry | | |
| Collision test | Two-client key generation showing distinct keys | | |

## Notes / Risks

_None recorded._


---

# STORY-03-02 — Tier 0 stateless per-transaction check

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-03 — Counter Engine** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.2.0, 2.3.1, 5 |
| **BRD UAT mapping** | UAT 12, UAT 13, UAT 33 |
| **Depends on** | STORY-02-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Per-transaction limits require no counter and no write, so the mandatory Global per-transaction cap has zero contention cost and remains exact at full load. The service must fail closed if that cap is missing.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a transaction amount above the configured per-transaction threshold | it is evaluated | it is rejected with no counter read and no counter write performed |
| 2 | a transaction amount exactly equal to the threshold | it is evaluated | it is approved, because thresholds are inclusive maxima |
| 3 | a client whose Global per-transaction limit is missing from configuration | a transaction is submitted | the service fails closed and rejects rather than treating the limit as unlimited |
| 4 | no other dimension having any configured limit | a transaction exceeding the Global per-transaction cap arrives | it is still rejected, because this check cannot be bypassed |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Boundary test | UAT 33 result for exactly-at-threshold and one unit over | | |
| Fail-closed test | UAT 13 result for a missing mandatory cap | | |
| Zero-write proof | Instrumentation showing no counter operation on a per-transaction rejection | | |

## Notes / Risks

_None recorded._


---

# STORY-03-03 — Tier 1 bootstrap plus guarded conditional increment

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-03 — Counter Engine** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.2.1, 2.3.1 |
| **BRD UAT mapping** | UAT 29, UAT 33 |
| **Depends on** | STORY-03-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

High-cardinality counters use a two-step operation: an unconditional bootstrap upsert that materialises the window document, then a guarded update with upsert disabled that performs check and increment atomically. The guard must never be combined with upsert, because on a genuine breach that combination raises a duplicate key error instead of a clean no-match, which the retry policy would then misread as a transient fault.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a counter within its threshold | a transaction is evaluated | the guarded update matches, the increment is applied atomically, and the transaction passes |
| 2 | a counter that would breach its threshold | a transaction is evaluated | the guarded update returns zero matched documents, the breach is reported on the first attempt, and no duplicate key error is raised |
| 3 | a breach occurring under the retry policy | the engine handles the result | no retry and no backoff is consumed, and the rejection latency is comparable to an approval |
| 4 | a window document that does not yet exist | two requests bootstrap it concurrently | one insert succeeds, the other duplicate key error is treated as benign, and both requests proceed correctly |
| 5 | a counter with both amount and count thresholds configured | a transaction breaches only one of them | the transaction is rejected on that metric alone and the audit names which metric breached |
| 6 | concurrent transactions against one entity sized so only a fixed number fit | they are submitted simultaneously | exactly that number are approved and the rest rejected, with no overshoot |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] A code-level assertion or lint rule prevents a range-guarded update from being written with upsert enabled

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Breach path test | UAT 29 result showing a clean first-attempt rejection with no duplicate key error | | |
| Retry proof | Metrics showing zero retry consumption on breach paths under load | | |
| Concurrency test | Result showing exact approval count under simultaneous contention | | |

## Notes / Risks

This corrects a defect present in BRD v3 and v4. Regression coverage here is mandatory, not optional.


---

# STORY-03-04 — Tier 2 sharded counters with cached totals

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-03 — Counter Engine** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.2.2, 4.2.3, 4.2.4 |
| **BRD UAT mapping** | UAT 19, UAT 20, UAT 22 |
| **Depends on** | STORY-03-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Hot low-cardinality counters are split into shard buckets so no single document absorbs the full write rate. Totals are read as the sum across buckets, served from a short-lived in-process cache on the hot path. These limits are explicitly approximate with a bounded overshoot.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a hot dimension under 1000 increments per second at one logical counter | load is sustained | writes spread across the configured shard buckets and no single document exceeds a safe per-document write rate |
| 2 | a known number of approved transactions against a sharded counter | the buckets are summed | the total amount and count match the expected values exactly |
| 3 | a reversal of a transaction that incremented a sharded counter | the reversal is processed | the specific recorded bucket is decremented and the summed total reduces correctly |
| 4 | a hot counter under high concurrency | the limit is approached | any overshoot stays within the documented bound and is measured rather than assumed |
| 5 | a hot counter total served from cache | the refresh interval elapses | the cached value is refreshed and staleness never exceeds the configured interval |
| 6 | a low-volume client declaring the same dimension as not hot | traffic is processed | no sharding is applied and the counter uses the strict path |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Hot load test | UAT 19 result with per-document write rate and p99 internal latency | | |
| Sum correctness test | UAT 20 result including reversal effect on the summed total | | |
| Overshoot measurement | UAT 22 result quantifying observed overshoot against the documented bound | | |

## Notes / Risks

_None recorded._


---

# STORY-03-05 — Safe shard factor change semantics

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-03 — Counter Engine** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.2.6 |
| **BRD UAT mapping** | UAT 34 |
| **Depends on** | STORY-03-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Lowering a shard factor mid-window would orphan buckets whose balances silently drop out of the sum, under-counting velocity and over-approving. This is a fail-open direction and must be structurally prevented.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an open window and a lowered shard factor | the configuration change is applied | the change takes effect only at the next window boundary and the in-force value stays pinned for the open window |
| 2 | an open window whose shard factor changed | a total is read | the reader sums the maximum of the historical and current bucket counts so no bucket is orphaned |
| 3 | a shard factor change that would take effect mid-window | it is submitted | registry validation rejects it unless it is an increase and the reader-side maximum rule is in force |
| 4 | a transaction approved under one shard factor | it is later reversed | the reversal uses the shard factor recorded at approval time |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Orphan prevention test | UAT 34 result showing the summed total does not drop after a lowering change | | |
| Over-approval check | Test confirming no transaction is approved that a correct total would have rejected | | |

## Notes / Risks

_None recorded._


---

# STORY-03-06 — Rolling window as a single document with pipeline update

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-03 — Counter Engine** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 13 |
| **BRD reference** | Section 4.2.5 |
| **BRD UAT mapping** | UAT 31, UAT 32, UAT 1 |
| **Depends on** | STORY-03-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

The sliding 24-hour window is a single document per entity holding hourly sub-buckets, updated by an aggregation pipeline that prunes, sums and conditionally increments atomically. Spreading the total across separate documents would make strict enforcement impossible, so this design is what makes the per-entity rolling guarantee real.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | concurrent transactions against one entity rolling limit sized so only a fixed number fit | they are submitted simultaneously | exactly that number are approved and the rest rejected, with no overshoot |
| 2 | a rolling document containing sub-buckets older than the window horizon | the next update runs | expired sub-buckets are pruned in the same operation and the document stays bounded |
| 3 | a transaction that breaches the rolling limit | the pipeline update runs | the applied flag is false, the returned document carries exact current velocity, and no second read is required for the audit |
| 4 | a calendar day boundary crossing | a transaction breaching the rolling limit arrives | it is still rejected, because the rolling window does not reset with the calendar day |
| 5 | a dimension configured with minute granularity | transactions are processed | rolling precision tightens accordingly and the document remains within size limits |
| 6 | a hot dimension declaring a rolling window | traffic is processed | the rolling counter is sharded and reverts to the documented approximate semantics |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] MongoDB 5.0 or later is confirmed in every environment, since pipeline updates are a hard platform requirement

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Strictness test | UAT 31 result showing exactly the expected approval count with zero overshoot | | |
| Pruning test | UAT 32 result showing bounded document size over a simulated multi-day run | | |
| Platform confirmation | Recorded MongoDB version for each environment | | |

## Notes / Risks

Largest single story in the backlog. If the platform cannot be moved to 5.0, this story must be replaced by an optimistic-version retry design, which is correct but slower under contention.


---

# STORY-03-07 — Read preference and write concern policy

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-03 — Counter Engine** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.6 |
| **BRD UAT mapping** | UAT 37 |
| **Depends on** | STORY-03-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

All counter reads and the rolling pipeline update must target the primary. A counter read served by a lagging secondary produces a stale total and over-approves, which is the one failure direction this system must never have. Write concern is deliberately asymmetric between counters and the audit record.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | induced replication lag on secondaries | counter reads are issued | every read is served by the primary and no stale-read over-approval occurs |
| 2 | the counter path in any code path | the driver configuration is inspected | read preference is primary and this is asserted by an automated check rather than convention |
| 3 | a transaction being processed | writes are issued | counter increments use the faster write concern while the claim and status resolution use majority |
| 4 | reporting or reconciliation queries | they are executed | they may target secondaries and are never on the enforcement path |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Lag test | UAT 37 result under induced replication lag | | |
| Configuration assertion | Automated test failing if read preference drifts from primary | | |

## Notes / Risks

_None recorded._


---

# STORY-04-01 — Pending claim idempotency mutex

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-04 — Transaction Validation and Idempotency** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.1 |
| **BRD UAT mapping** | UAT 8, UAT 30 |
| **Depends on** | STORY-01-03 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

The transaction record is written as a pending claim before any validation or counter access, so the unique compound index acts as a true mutex. Checking for existence before validation but writing only afterwards allows two concurrent retries to both run the waterfall and both increment counters, which is the defect this story closes.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | many concurrent requests carrying an identical client and transaction identifier | they are submitted simultaneously | exactly one runs the waterfall, counters are incremented exactly once in total, and the final counter value matches a single transaction |
| 2 | a transaction already resolved as approved, rejected or reversed | the same identifier is submitted again | the stored result is returned verbatim with no re-validation and no counter access |
| 3 | a transaction currently held in the pending state by another request | the same identifier is submitted | an in-progress response is returned and the request never proceeds to the counter path |
| 4 | two different clients using the same transaction identifier | both submit | both are processed independently and neither resolves to the other stored result |
| 5 | a claim that succeeds | the waterfall completes | the claim is updated in place to the final status with applied counter keys attached |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] The compound client and transaction identifier is the document primary key so the mutex needs no secondary index

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Concurrency test | UAT 30 result proving counters increment exactly once under N concurrent duplicates | | |
| Sequential idempotency | UAT 8 result for the simple repeat case | | |
| Cross-client test | Result showing identical identifiers across clients do not cross-resolve | | |

## Notes / Risks

Corrects a defect present in BRD v3 and v4. The consumer contract gains a new in-progress response, so consumer teams must be notified.


---

# STORY-04-02 — Stale pending claim reaper

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-04 — Transaction Validation and Idempotency** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 3.1.1 |
| **BRD UAT mapping** | UAT 35 |
| **Depends on** | STORY-04-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

A process that crashes mid-waterfall leaves an orphaned pending claim that would otherwise block legitimate retries of that transaction forever. The reaper resolves stale claims to an abandoned state and refers them to reconciliation, because a crashed request may have applied increments it could not compensate.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an instance killed mid-waterfall leaving a pending claim | the configured staleness threshold elapses | the claim is transitioned to abandoned and a fresh retry of that identifier is accepted |
| 2 | an abandoned claim | the reaper completes | the transaction is referred to reconciliation so any orphaned increments are repaired |
| 3 | a healthy in-flight request within the staleness threshold | the reaper runs | the claim is left untouched and the request completes normally |
| 4 | the transactions collection | the reaper operates | claims are transitioned by status change and never deleted, preserving the audit record |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Crash recovery test | UAT 35 result showing retry accepted after reaping | | |
| Non-interference test | Result showing healthy in-flight requests are not reaped | | |

## Notes / Risks

_None recorded._


---

# STORY-04-03 — Config-driven validation waterfall

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-04 — Transaction Validation and Idempotency** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 2.4, 2.3 |
| **BRD UAT mapping** | UAT 6, UAT 7, UAT 14, UAT 18 |
| **Depends on** | STORY-02-02, STORY-03-03 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Iterate the client declared dimensions in registry order, evaluating only the windows each dimension declares, and reject on the first breach. A new dimension or window must become enforceable through configuration alone.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a dimension whose required attribute is absent from the transaction | the waterfall runs | that dimension is skipped as not applicable without error |
| 2 | a monthly limit breached while daily and per-transaction checks pass | a transaction is evaluated | it is rejected on the monthly window at that dimension |
| 3 | several dimensions each with configured limits | a transaction is evaluated | daily and monthly limits are enforced independently at each dimension |
| 4 | a new composite dimension added to the registry with a matching limit | the next transaction arrives | it is enforced with no code change and no deployment |
| 5 | a dimension with both amount and count thresholds | a transaction breaches only the count | it is rejected on count alone while the amount remains within range, and the reverse case also holds |
| 6 | the first breach in the waterfall | it is detected | evaluation stops immediately and no further dimension is checked |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Independence test | UAT 7 result across all configured dimensions | | |
| Extensibility test | UAT 14 result adding a dimension with no code change | | |
| Dual metric test | UAT 18 result for count-only and amount-only breaches | | |

## Notes / Risks

_None recorded._


---

# STORY-04-04 — Compensating saga with correct retry classification

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-04 — Transaction Validation and Idempotency** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.3 |
| **BRD UAT mapping** | UAT 3, UAT 4 |
| **Depends on** | STORY-04-03 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Because there is no cross-document atomic primitive on the hot path, all-or-nothing behaviour is approximated by compensation. The critical rule is that a limit breach is not a transient error and must never enter the retry path, while genuine transient faults are retried with bounded backoff.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | several dimensions already incremented and a later dimension breaching | the breach is detected | all previously applied counters for that transaction are decremented in reverse order before the rejection is returned |
| 2 | a status resolution failure after counters were incremented | retries are exhausted | all applied increments are compensated and an error response is returned |
| 3 | a transient fault such as a write conflict or network blip | it occurs on a single-document operation | the operation is retried with the configured bounded backoff and the request completes without an error response |
| 4 | a limit breach | it is returned by a counter operation | it is classified as a decision rather than a fault, is never retried, and consumes no backoff |
| 5 | a compensation decrement that fails after retries | the failure occurs | it is recorded and referred to reconciliation rather than being silently dropped |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Compensation test | UAT 3 result showing full rollback of applied increments | | |
| Transient handling | UAT 4 result showing retries absorb induced blips | | |
| Classification proof | Metrics separating breach outcomes from fault retries | | |

## Notes / Risks

_None recorded._


---

# STORY-04-05 — Audit record and rejection detail capture

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-04 — Transaction Validation and Idempotency** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 3.2 |
| **BRD UAT mapping** | UAT 2 |
| **Depends on** | STORY-04-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Every request is persisted with enough detail to explain the decision later, including which dimension and window breached, which metric, the threshold and definition version in force, current velocity, and the exact counter keys and shard buckets applied.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a rejected transaction | the audit record is written | it names the breached dimension, window, metric, threshold, definition version, and both current amount and count |
| 2 | an approved transaction | the audit record is written | it lists every applied counter key with its dimension, window, resolved attribute values, shard bucket and shard factor in force |
| 3 | any transaction | its record is inspected | it carries the clientId and can be retrieved by the compound client and transaction identifier |
| 4 | a decision taken while a window is warming | the record is written | it carries the warming state flag |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Audit completeness | UAT 2 result validating every required rejection field | | |
| Reversal support | Confirmation that recorded keys are sufficient to reverse without re-deriving them | | |

## Notes / Risks

_None recorded._


---

# STORY-04-06 — Client timezone windows and clock skew control

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-04 — Transaction Validation and Idempotency** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.8 |
| **BRD UAT mapping** | UAT 40 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Window boundaries are computed in the client configured timezone rather than the server timezone, with storage remaining in UTC. Instance clock skew splits writes across adjacent buckets at a boundary, so skew must be bounded and monitored.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a client configured in a timezone other than the server timezone | a calendar day or monthly window is evaluated | the window resets at midnight in the client timezone |
| 2 | two clients in different timezones | both are processed | each observes its own reset boundaries independently |
| 3 | an instance whose clock skew exceeds the configured tolerance | the condition is detected | an alert is raised and the instance is drained from the pool |
| 4 | all instances running within the skew tolerance | a window boundary is crossed | bucket assignment is consistent across instances |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Timezone test | UAT 40 result for a non-server timezone client | | |
| Skew monitoring | Alert configuration and a test firing showing detection | | |

## Notes / Risks

_None recorded._


---

# STORY-05-01 — Reversal API with ordering and floor guards

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-05 — Reversal and Reconciliation** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.4 |
| **BRD UAT mapping** | UAT 9, UAT 10, UAT 17, UAT 44 |
| **Depends on** | STORY-04-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Reverse an approved transaction by decrementing the exact counter documents recorded at approval. The status flip is attempted first so two concurrent reversal calls cannot both decrement, and decrements are guarded so a counter can never go negative.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an approved transaction | reversal is called | the exact recorded counter documents including the specific shard bucket are decremented and the status becomes reversed |
| 2 | the same transaction | reversal is called a second time | the second call is a no-op with no double decrement |
| 3 | two concurrent reversal calls for one transaction | both arrive simultaneously | the status flip succeeds once and only that caller applies decrements |
| 4 | a transaction that is rejected, already reversed or non-existent | reversal is called | the call is a no-op or error response and no counter is touched |
| 5 | a dimension or window de-activated in the registry after approval | reversal is called | the now-ungoverned counter is skipped and logged without error, while other recorded counters are still decremented |
| 6 | a decrement that would drive a counter below zero | it is attempted | the floor guard prevents it and the condition is recorded as a drift signal |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Reversal test | UAT 9 result showing exact bucket decrement | | |
| Idempotency test | UAT 10 result for the repeated call | | |
| De-activation test | UAT 44 result showing skip without error | | |
| Concurrency test | Result showing only one of two simultaneous reversals applies decrements | | |

## Notes / Risks

_None recorded._


---

# STORY-05-02 — Counter reconciliation sweeper

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-05 — Reversal and Reconciliation** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.5 |
| **BRD UAT mapping** | UAT 36 |
| **Depends on** | STORY-05-01, STORY-04-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Compensation can itself fail, and a crashed request can leave increments nobody compensated, leaving a counter permanently inflated and silently over-rejecting real customers. Because the transaction collection records every applied counter key, counters are derivable and therefore repairable.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | injected counter drift from a failed compensation | the sweeper runs | the drift is detected, alerted, and the closed-window counter is corrected to the value derived from the transaction records |
| 2 | a failed decrement floor guard, a failed compensation or an abandoned claim | any of these occur | the affected key is queued for targeted reconciliation rather than waiting for the periodic sweep |
| 3 | an open window with drift | the sweeper runs | the drift is alerted first and auto-correction is applied only where policy permits, since silently rewriting a live risk counter is itself a risk |
| 4 | a sharded hot counter operating within its documented overshoot bound | the sweeper runs | no drift alert is raised, because the tolerance is set above the accepted bound |
| 5 | a closed window | the nightly pass runs | all counters for that window are verified against derived values |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Drift repair test | UAT 36 result showing detection, alert and correction | | |
| False positive check | Result showing normal Tier 2 operation generates no drift noise | | |
| Runbook | Documented operator procedure for responding to a drift alert | | |

## Notes / Risks

_None recorded._


---

# STORY-06-01 — Audit retention, archival and collection sharding

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-06 — Operations, Resilience and Compliance** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.7 |
| **BRD UAT mapping** | None (operational) |
| **Depends on** | STORY-04-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

At 1000 RPS the transaction collection grows by roughly 86 million documents per day. Unmanaged, this collection alone determines the fate of the cluster, so the hot tier, archive tier and shard key must be decided before launch rather than after.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the transaction collection under sustained load | growth is measured | observed document and storage growth per day is within the projected sizing envelope |
| 2 | records older than the configured hot retention period | the archival process runs | they are moved to the cold store and remain retrievable by the compound client and transaction identifier |
| 3 | the transaction collection | its shard key is inspected | it leads with clientId and includes a hashed or date component so no monotonically increasing shard hotspot forms |
| 4 | any proposed additional index on the transaction collection | it is reviewed | it is justified against a named query pattern, since each index costs tens of millions of entries per day |
| 5 | the hot retention period | it is configured | it exceeds the longest consumer retry horizon and the settlement window required for reversal |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Statutory retention term confirmed in writing with the bank compliance function and recorded in the BRD

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Sizing report | Measured storage, IOPS and working set at target load against projections | | |
| Archival test | Retrieval of an archived record by its identifier | | |
| Compliance confirmation | Written retention term from the compliance owner | | |

## Notes / Risks

This was the largest operational omission in earlier BRD versions. Treat sizing sign-off as a gate, not a follow-up.


---

# STORY-06-02 — Observability and alerting

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-06 — Operations, Resilience and Compliance** |
| **Status** | `Not Started` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] On-call runbooks exist for every alert defined in this story

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Dashboard | Link to the dashboard showing all required metric families | | |
| Alert test | Evidence of each alert firing in a controlled test | | |
| Runbook review | Sign-off from the on-call owner | | |

## Notes / Risks

_None recorded._


---

# STORY-06-03 — Fail-closed degradation and disaster recovery posture

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-06 — Operations, Resilience and Compliance** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.9 |
| **BRD UAT mapping** | UAT 38 |
| **Depends on** | STORY-03-07 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

A velocity gate that fails open is worse than one that is down. Every degraded or ambiguous state must reject rather than allow, and there is deliberately no bypass toggle.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | MongoDB unreachable | transactions are submitted | they are rejected and never allowed through |
| 2 | an unresolvable configuration snapshot or a missing mandatory Global per-transaction limit | a transaction arrives | the service fails closed |
| 3 | the datastore recovering after an outage | traffic resumes | normal enforcement is restored with no manual counter repair required beyond reconciliation |
| 4 | the codebase | it is reviewed | no allow-through or bypass mode exists in any configuration path |
| 5 | a primary step-down during load | failover occurs | the driver retries writes across the step-down and any lost increments are repaired by reconciliation |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Fail-closed test | UAT 38 result under induced datastore unavailability | | |
| Failover test | Result showing recovery and reconciliation after a step-down | | |
| Recovery objectives | Confirmed targets and topology recorded in the BRD | | |

## Notes / Risks

_None recorded._


---

# STORY-06-04 — Data protection and access control

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-06 — Operations, Resilience and Compliance** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.10 |
| **BRD UAT mapping** | None (compliance) |
| **Depends on** | STORY-06-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

The transaction collection holds customer identifiers and account numbers at very high volume, making it a material data protection asset under the applicable Indian data protection and card industry obligations.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | all collections | storage is inspected | encryption at rest is enabled and transport is encrypted for client and intra-cluster connections |
| 2 | application logs and traces at any level | they are inspected | account numbers and customer identifiers are masked, and only the audit collection holds them in full |
| 3 | the application database principal | its privileges are inspected | it holds least privilege and has no write access to the client or configuration collections beyond what it requires |
| 4 | administrative endpoints | they are called with a tenant credential | access is refused, since admin and tenant roles are separate |
| 5 | field level encryption or tokenisation for sensitive identifiers | the assessment is completed | the decision and its rationale are recorded before launch |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Encryption confirmation | Configuration evidence for at rest and in transit | | |
| Log audit | Sample logs demonstrating masking | | |
| Privilege matrix | Documented roles and their granted privileges | | |
| Compliance decision | Recorded field level encryption assessment outcome | | |

## Notes / Risks

_None recorded._


---

# STORY-07-01 — Sustained throughput and latency certification

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-07 — Performance and Acceptance Certification** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.1 |
| **BRD UAT mapping** | UAT 5 |
| **Depends on** | STORY-04-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Demonstrate the sustained load target with the end to end latency envelope and the internal engine budget held, using a realistic mix of dimensions and windows rather than a single trivial path.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a realistic transaction mix across all declared dimensions and windows | sustained target load is applied | end to end response time stays within the stated envelope |
| 2 | the same run | internal timings are measured | the limit check and datastore operations stay within the internal engine budget on the happy path |
| 3 | the claim write added by the idempotency mutex | load is applied | its cost is measured and confirmed to fit within the internal budget |
| 4 | the load run | configuration reads are profiled | no configuration read occurs on the transaction path |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Load test report | UAT 5 result with throughput, end to end and internal latency percentiles | | |
| Breakdown | Per-tier latency attribution showing where the budget is spent | | |

## Notes / Risks

_None recorded._


---

# STORY-07-02 — Hot counter concurrency certification

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-07 — Performance and Acceptance Certification** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.1, 4.2.2, 4.2.4 |
| **BRD UAT mapping** | UAT 19, UAT 22 |
| **Depends on** | STORY-03-04, STORY-03-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Prove the central engineering claim of this design: that a single logical counter can absorb the full request rate because it is split across shard buckets, and that the resulting approximation stays inside its documented bound.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a single logical hot counter | the full target increment rate is driven at it | no individual document exceeds a safe per-document write rate and write conflict retries stay within budget |
| 2 | the same run | latency is measured | internal p99 stays within the budget rather than degrading as contention rises |
| 3 | the same run | overshoot is measured | it stays within the documented bound and the measured figure is recorded in the BRD |
| 4 | shard factor tuning | it is adjusted | the effect on write conflict rate and read cost is measured and the chosen values are justified |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Hot counter report | UAT 19 result with per-document write rates and conflict metrics | | |
| Overshoot figure | Measured bound recorded against the documented claim | | |
| Tuning rationale | Recorded justification for the shard factor values chosen per dimension | | |

## Notes / Risks

_None recorded._


---

# STORY-07-03 — Formal UAT execution pack

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-07 — Performance and Acceptance Certification** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 6 |
| **BRD UAT mapping** | UAT 1 to UAT 44 |
| **Depends on** | STORY-07-01, STORY-07-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Execute and record every acceptance case in the BRD, with each case traced to the story that implements it. A case with no recorded result is treated as failed.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the full acceptance criteria list | execution completes | every case has a recorded pass, fail or accepted deferral with a written decision |
| 2 | each acceptance case | it is reviewed | it is traceable to at least one backlog story and that story is marked done |
| 3 | any failed case | it is recorded | a defect is raised and linked, and the related story returns to in progress |
| 4 | the acceptance pack | it is presented for sign-off | the business and risk owners record formal acceptance |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Execution matrix | Complete acceptance case results with pass and fail status | | |
| Traceability matrix | Mapping from every acceptance case to its implementing story | | |
| Sign-off | Recorded business and risk owner acceptance | | |

## Notes / Risks

_None recorded._


---

# STORY-08-01 — Direction resolution validation and fail-closed gating

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-08 — Direction Scoping and INWARD Readiness** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 2.1.5, 2.1.6, 2.1.8 |
| **BRD UAT mapping** | UAT 49 |
| **Depends on** | STORY-01-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Direction is an explicit mandatory request field, because unlike the client identifier it cannot be derived from the authenticated principal. The same client submits both directions over the same credential. Defaulting an absent direction would silently mis-scope traffic into the wrong counters, so absence must be a rejection.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a request with no direction field | it is submitted | it is rejected before any validation or counter access and is never defaulted to outward |
| 2 | a request with an unrecognised direction value | it is submitted | it is rejected with a clear error naming the accepted values |
| 3 | a direction that is valid but not enabled for that client | a transaction is submitted | it is rejected even though the direction is valid in principle |
| 4 | a client with a direction enabled | a transaction for that direction arrives | it is processed against that direction registry and limit definitions |
| 5 | any processed request | its audit record is written | the resolved direction is recorded on the record |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Fail-closed test | UAT 49 result covering missing, unrecognised and not-enabled direction | | |
| No-default proof | Test confirming an absent direction is never treated as outward | | |

## Notes / Risks

Direction differs fundamentally from the client identifier in trust model. The client identifier comes from the principal and is never trusted from the payload. Direction must come from the payload and therefore needs its own validation against the enabled set.


---

# STORY-08-02 — Direction segment in counter keys and transaction identity

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-08 — Direction Scoping and INWARD Readiness** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.2, 3.1, 3.2 |
| **BRD UAT mapping** | UAT 45, UAT 50 |
| **Depends on** | STORY-03-01, STORY-04-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Place the direction segment into the counter key and the transaction primary key now, while only outward traffic exists. Adding it later would be a re-keying migration of every counter document and a rewrite of the idempotency index. Adding it now costs a constant string. This is the single most important story in the epic even though it changes no observable behaviour today.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an outward and an inward transaction with the same client, dimension code and attribute values | both are processed | they increment separate counter documents and neither affects the other velocity |
| 2 | a counter key being built | it is inspected | the direction segment sits immediately after the client identifier so a client counters remain contiguous by direction |
| 3 | an outward and an inward transaction carrying the identical transaction identifier for one client | both are submitted | both are processed independently and neither resolves to the other stored decision |
| 4 | an approved transaction | its audit record is written | every applied counter key records the direction segment actually used |
| 5 | the reversal endpoint | it is called | it accepts direction alongside the transaction identifier and locates the correct record |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] The reversal API contract change is published to consumer teams before release

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Separation test | UAT 45 result showing separate counters for identical dimensions across directions | | |
| Collision test | UAT 50 result for identical identifiers across directions | | |
| Contract note | Published consumer notice describing the direction field on reversal | | |

## Notes / Risks

During the single-direction period the reversal API may default a missing direction to outward. That leniency must be withdrawn as an announced step when a second direction is enabled, not silently.


---

# STORY-08-03 — Per-direction dimension registry with backward compatible loading

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-08 — Direction Scoping and INWARD Readiness** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.3, 2.2 |
| **BRD UAT mapping** | UAT 46, UAT 52 |
| **Depends on** | STORY-02-01, STORY-08-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Restructure the client registry so dimensions are declared per direction, allowing each direction an entirely independent dimension set. A legacy configuration carrying a top-level dimension list normalises to an outward-only registry so the current client continues to work unchanged.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a client configuration declaring different dimension sets for each direction | transactions are processed | each direction evaluates only its own dimensions and neither errors on the other absence |
| 2 | the same dimension code declared in both directions with different windows and thresholds | transactions are processed | each direction enforces its own policy against its own counters |
| 3 | a legacy configuration with a top-level dimension list and no direction map | it is loaded | it normalises to an outward-only registry and existing outward enforcement is unchanged |
| 4 | a configuration change affecting one direction | it is applied | both directions are swapped in one atomic snapshot so their versions cannot diverge |
| 5 | a direction being enabled without a valid registry or without its mandatory global per-transaction limit | enablement is attempted | it is rejected, so no window exists in which traffic is accepted but ungoverned |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Divergent set test | UAT 46 result for direction-specific dimensions | | |
| Migration test | UAT 52 result showing legacy config normalisation with unchanged behaviour | | |
| Enablement guard | Test showing a direction cannot be enabled with an invalid or incomplete registry | | |

## Notes / Risks

_None recorded._


---

# STORY-08-04 — Combined direction scope for total throughput controls

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-08 — Direction Scoping and INWARD Readiness** |
| **Status** | `Not Started` |
| **Priority** | Should |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 2.1.7, 4.2 |
| **BRD UAT mapping** | UAT 47, UAT 48 |
| **Depends on** | STORY-08-03 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Support a dimension declared as combined, whose counter is shared across both directions under a direction-neutral key segment. This expresses a total-throughput control that neither direction can enforce alone, such as a cap on total account turnover regardless of whether funds are arriving or leaving.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a combined dimension declared identically in both directions | outward and inward transactions are processed | both increment the same shared counter and the combined total triggers rejection in either direction |
| 2 | a reversal of a transaction that incremented a combined counter | reversal is called | the shared key is decremented correctly and the combined total reduces |
| 3 | a combined dimension declared with different attributes or windows across the two directions | the configuration is submitted | registry validation rejects it and the previously loaded snapshot stays in force |
| 4 | a hot combined dimension | sharding is sized | the shard factor is sized against the sum of both directions rates rather than either alone |
| 5 | a combined counter key | it is inspected | the direction segment carries the shared neutral value rather than a specific direction |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Shared counter test | UAT 47 result showing both directions incrementing one total | | |
| Asymmetry rejection | UAT 48 result for mismatched combined declarations | | |
| Sizing rationale | Recorded shard factor justification against combined rate | | |

## Notes / Risks

Confirm with the risk function whether any combined control is actually required before building this. It is genuinely useful for mule-account throughput detection but adds a counter that is hot from both directions at once.


---

# STORY-08-05 — Direction-scoped configuration APIs and inert inward policy

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-08 — Direction Scoping and INWARD Readiness** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.4 |
| **BRD UAT mapping** | UAT 51 |
| **Depends on** | STORY-08-03, STORY-02-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Extend the configuration APIs so registries and limit definitions are addressed per direction, and so an inward policy can be authored, reviewed and stored while inward remains disabled. This is what makes enabling inward a reviewed switch rather than a big-bang release.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | inward not yet enabled | a full inward registry and inward limit definitions are created | they are stored, reported as not effective, and have no effect on outward traffic |
| 2 | that stored inward policy | inward is subsequently enabled | it is enforced immediately with no code change and no redeployment |
| 3 | a limit definition | it is created | it carries a direction that is immutable thereafter |
| 4 | a list request for limit definitions | it is filtered by direction | only that direction definitions are returned, each with its effective flag |
| 5 | a definition whose direction is not enabled | it is created | the response carries a non-blocking warning naming the direction gate specifically |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Inert policy test | UAT 51 result showing storage, non-effect and activation on enablement | | |
| API contract | Documented direction-scoped endpoints reviewed with consumer teams | | |

## Notes / Risks

_None recorded._


---

# STORY-08-06 — INWARD capacity and sizing assessment

| Field | Value |
| :--- | :--- |
| **Epic** | **EPIC-08 — Direction Scoping and INWARD Readiness** |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.5, 4.1, 4.7 |
| **BRD UAT mapping** | None (planning) |
| **Depends on** | STORY-08-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Enabling inward adds an independent counter set and an independent claim and audit write stream. Capacity is additive rather than free, so the throughput target must be restated and the storage projections revisited before inward is switched on.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the stated throughput target | inward enablement is planned | the target is restated explicitly as either per direction or combined and recorded in the specification |
| 2 | audit storage projections | inward volume is added | revised daily document and storage growth figures are produced and reviewed against the retention design |
| 3 | hot dimensions in each direction | sizing is reviewed | shard factors are set per direction from that direction measured rate rather than copied from outward |
| 4 | the sizing assessment | it is completed | infrastructure sign-off is recorded before inward traffic is accepted |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Restated target | Written throughput target with the per-direction or combined basis stated | | |
| Revised sizing | Updated storage and IOPS projections including inward | | |
| Sign-off | Infrastructure acceptance recorded | | |

## Notes / Risks

_None recorded._
