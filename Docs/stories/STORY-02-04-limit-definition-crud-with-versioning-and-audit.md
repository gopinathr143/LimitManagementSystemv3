# STORY-02-04 — Limit definition CRUD with versioning and audit

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.4, 2.3.3 |
| **BRD UAT mapping** | UAT 11, UAT 16, UAT 39 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Client-scoped CRUD for limit definitions, including scope overrides, effective dating, definition versioning and an immutable configuration audit trail. Thresholds are inclusive maxima and a mid-window change does not re-base already accumulated velocity.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an existing limit definition | it is updated through the API | subsequent transactions are evaluated against the new threshold without a service restart |
| 2 | a scope override pinned to specific attribute values and a wildcard default for the same dimension | a transaction matches the pinned values | the scope override threshold takes precedence over the default |
| 3 | a threshold lowered below a customer already accumulated velocity | the next transaction in that window arrives | it is rejected, and the audit record names the new definition version in force |
| 4 | any create, update or delete on a definition | the write completes | an immutable audit entry records actor, timestamp, before and after values, and the new definition version |
| 5 | a definition with an effective-from date in the future | a transaction is evaluated before that date | the definition is not applied |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Amounts are stored and compared as integers in minor units with no floating point anywhere in the path

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| CRUD effect test | UAT 11 result showing changes take effect with no restart | | |
| Precedence test | UAT 16 result for scope override over wildcard default | | |
| Threshold change test | UAT 39 result including the recorded definition version | | |
| Audit sample | Configuration audit entry for one update | | |

## Notes / Risks

_None recorded._
