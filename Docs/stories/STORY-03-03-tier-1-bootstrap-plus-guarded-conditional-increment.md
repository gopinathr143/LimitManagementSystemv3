# STORY-03-03 — Tier 1 bootstrap plus guarded conditional increment

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
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
