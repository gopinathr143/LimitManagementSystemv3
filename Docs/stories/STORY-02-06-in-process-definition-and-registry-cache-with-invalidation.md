# STORY-02-06 — In-process definition and registry cache with invalidation

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
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
