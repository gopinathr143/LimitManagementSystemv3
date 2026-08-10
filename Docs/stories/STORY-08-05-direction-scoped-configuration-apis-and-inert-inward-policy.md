# STORY-08-05 — Direction-scoped configuration APIs and inert inward policy

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
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
