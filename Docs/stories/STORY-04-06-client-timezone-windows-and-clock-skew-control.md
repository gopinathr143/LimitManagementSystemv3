# STORY-04-06 — Client timezone windows and clock skew control

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
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
