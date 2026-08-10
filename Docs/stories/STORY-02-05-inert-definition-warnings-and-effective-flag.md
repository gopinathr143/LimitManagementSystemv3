# STORY-02-05 — Inert definition warnings and effective flag

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `Not Started` |
| **Priority** | Should |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.4 |
| **BRD UAT mapping** | UAT 15, UAT 41 |
| **Depends on** | STORY-02-02, STORY-02-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

A limit definition can now be inert for two distinct reasons: the dimension is not registered, or the window is not declared for that dimension. Silently accepting a limit that will never fire is the failure mode this story prevents.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a definition for a dimension not present in the client registry | it is created through the API | the write succeeds and the response carries a non-blocking warning naming the closed gate |
| 2 | a definition for a window not declared on an otherwise registered dimension | it is created | the write succeeds and the warning names the window gate specifically, not just the dimension |
| 3 | a list request for a client definitions | the response is returned | each definition carries an effective flag reflecting whether it is currently enforced |
| 4 | an inert definition whose gate is subsequently opened in the registry | a transaction is evaluated | the definition becomes effective without being re-submitted |

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
| Warning content test | API response samples for both inert causes | | |
| Activation test | UAT 15 result showing a definition becoming effective when its gate opens | | |

## Notes / Risks

_None recorded._
