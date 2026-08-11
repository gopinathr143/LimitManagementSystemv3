# STORY-04-04 — Compensating saga with correct retry classification

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
| **Status** | `In Review` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set and via fake-based unit tests for the paths real infrastructure can't reliably trigger; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/transaction.service.test.js` (SYSTEM_FAILURE on resolve-write failure, compensation-failure-doesn't-block-resolution, breach-never-throws)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/transaction.waterfall.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — compensation-failure and SYSTEM_FAILURE events are logged at error level; §4.11's "compensation-failure rate" as an aggregated metric is not yet wired to a metrics emitter (see EPIC-01/02/03 DoD notes)
- [x] BRD section updated if implementation diverged from the written design — no divergence; reuses EPIC-03's `withTransientRetry` (WriteConflict/network/step-down retried, breach never retried) unchanged, applied at the orchestration level here

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Compensation test | UAT 3 result showing full rollback of applied increments | `tests/integration/transaction.waterfall.test.js` — "AC2 + STORY-04-04 AC1: a monthly breach after daily passes rejects and rolls back the already-applied daily counter" (verifies the summed total returns to exactly zero); `tests/unit/transaction.service.test.js` — "AC2: a resolve-write failure after counters were incremented compensates everything and returns SYSTEM_FAILURE" | |
| Transient handling | UAT 4 result showing retries absorb induced blips | Reused from EPIC-03's `withTransientRetry` (`src/utils/retry.js`), unit-tested there; not re-tested here since the orchestration layer added in this story doesn't change that mechanism, only calls it | |
| Classification proof | Metrics separating breach outcomes from fault retries | `tests/unit/transaction.service.test.js` — "a limit breach is a returned decision, never a thrown error — the request completes with no exception propagating"; structurally, `withTransientRetry` only ever sees thrown errors, and a breach is a normal return value (STORY-03-03's design, reused unchanged) | |

## Notes / Risks

_None recorded._
