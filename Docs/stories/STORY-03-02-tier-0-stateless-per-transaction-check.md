# STORY-03-02 — Tier 0 stateless per-transaction check

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
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
