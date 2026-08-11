# STORY-03-03 — Tier 1 bootstrap plus guarded conditional increment

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `In Review` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set, stable across 6+ repeated runs of the concurrency test; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/counter.model.test.js`, `tests/unit/counterRepository.readWritePolicy.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/counterEngine.tier1.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — no metrics emitter yet (see EPIC-01/02 DoD notes); WriteConflict-rate and retry-exhaustion metrics named in BRD §4.11 are a real gap once this runs under load
- [x] BRD section updated if implementation diverged from the written design — no divergence; the defect-fix design (bootstrap + guarded `upsert:false` update) is implemented exactly as BRD §4.2.1 specifies
- [x] A code-level assertion or lint rule prevents a range-guarded update from being written with upsert enabled — not a lint rule but stronger: `CounterRepository.guardedIncrement`/`guardedDecrement` (`src/repositories/counter.repository.js`) hard-code `upsert: false` in the method body and accept no options parameter that could override it — structurally impossible to call otherwise, proven in `tests/unit/counterRepository.readWritePolicy.test.js`

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Breach path test | UAT 29 result showing a clean first-attempt rejection with no duplicate key error | `tests/integration/counterEngine.tier1.test.js` — "AC2 (breach): the guarded update returns matchedCount 0, not a duplicate-key error, on the first attempt"; verified directly against real MongoDB in a standalone smoke run (`matchedCount: 0`, no exception) before the test suite was written | |
| Retry proof | Metrics showing zero retry consumption on breach paths under load | Structural proof rather than a metrics dashboard (none exists yet): `src/utils/retry.js`'s `withTransientRetry` only intercepts *thrown* errors; a breach (`matchedCount:0`) is a normal return value that never enters the catch block, so no backoff can be consumed on that path by construction | |
| Concurrency test | Result showing exact approval count under simultaneous contention | `tests/integration/counterEngine.tier1.test.js` — "AC6/UAT 31-style: exactly K of N concurrent requests are approved, with zero overshoot" (30 concurrent requests against a counter sized for exactly 10), run 6 times consecutively with zero failures | |

## Notes / Risks

This corrects a defect present in BRD v3 and v4. Regression coverage here is mandatory, not optional — the concurrency test above was run 6 consecutive times specifically to build confidence beyond a single lucky pass, given this is the highest-consequence correctness property in the counter engine.
