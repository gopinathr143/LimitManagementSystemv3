# STORY-04-04 — Compensating saga with correct retry classification

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
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
