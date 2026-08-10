# STORY-06-03 — Fail-closed degradation and disaster recovery posture

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
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
