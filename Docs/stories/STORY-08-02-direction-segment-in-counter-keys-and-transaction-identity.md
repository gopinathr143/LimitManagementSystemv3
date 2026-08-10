# STORY-08-02 — Direction segment in counter keys and transaction identity

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.2, 3.1, 3.2 |
| **BRD UAT mapping** | UAT 45, UAT 50 |
| **Depends on** | STORY-03-01, STORY-04-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Place the direction segment into the counter key and the transaction primary key now, while only outward traffic exists. Adding it later would be a re-keying migration of every counter document and a rewrite of the idempotency index. Adding it now costs a constant string. This is the single most important story in the epic even though it changes no observable behaviour today.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an outward and an inward transaction with the same client, dimension code and attribute values | both are processed | they increment separate counter documents and neither affects the other velocity |
| 2 | a counter key being built | it is inspected | the direction segment sits immediately after the client identifier so a client counters remain contiguous by direction |
| 3 | an outward and an inward transaction carrying the identical transaction identifier for one client | both are submitted | both are processed independently and neither resolves to the other stored decision |
| 4 | an approved transaction | its audit record is written | every applied counter key records the direction segment actually used |
| 5 | the reversal endpoint | it is called | it accepts direction alongside the transaction identifier and locates the correct record |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] The reversal API contract change is published to consumer teams before release

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Separation test | UAT 45 result showing separate counters for identical dimensions across directions | | |
| Collision test | UAT 50 result for identical identifiers across directions | | |
| Contract note | Published consumer notice describing the direction field on reversal | | |

## Notes / Risks

During the single-direction period the reversal API may default a missing direction to outward. That leniency must be withdrawn as an announced step when a second direction is enabled, not silently.
