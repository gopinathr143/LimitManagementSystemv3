# STORY-03-06 — Rolling window as a single document with pipeline update

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
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
