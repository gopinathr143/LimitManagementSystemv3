# STORY-07-03 — Formal UAT execution pack

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-07 — Performance and Acceptance Certification](../epics/EPIC-07-performance-and-acceptance-certification.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 6 |
| **BRD UAT mapping** | UAT 1 to UAT 44 |
| **Depends on** | STORY-07-01, STORY-07-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Execute and record every acceptance case in the BRD, with each case traced to the story that implements it. A case with no recorded result is treated as failed.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the full acceptance criteria list | execution completes | every case has a recorded pass, fail or accepted deferral with a written decision |
| 2 | each acceptance case | it is reviewed | it is traceable to at least one backlog story and that story is marked done |
| 3 | any failed case | it is recorded | a defect is raised and linked, and the related story returns to in progress |
| 4 | the acceptance pack | it is presented for sign-off | the business and risk owners record formal acceptance |

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
| Execution matrix | Complete acceptance case results with pass and fail status | | |
| Traceability matrix | Mapping from every acceptance case to its implementing story | | |
| Sign-off | Recorded business and risk owner acceptance | | |

## Notes / Risks

_None recorded._
