# STORY-03-01 — Counter key builder, document model and TTL cleanup

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.2 |
| **BRD UAT mapping** | UAT 21 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Build counter document identifiers programmatically from the client registry, always leading with clientId, and rely on a TTL index for window cleanup so no application cleanup job is required.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a dimension with zero, one or several attributes | a counter key is built | the key is deterministic, leads with clientId, and concatenates attribute values in the order declared for that dimension |
| 2 | two clients with identical dimensions and identical attribute values | keys are built for both | the resulting keys differ and cannot collide |
| 3 | a calendar day or monthly counter whose window has passed | the TTL threshold elapses | the document is removed automatically with no application cleanup job running |
| 4 | a counter document being created | the write completes | clientId is present as a queryable field in addition to being embedded in the identifier |
| 5 | amounts written to a counter | values are stored | they are integers in minor units with no floating point representation |

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
| Key determinism test | Unit test output covering zero, single and composite attribute dimensions | | |
| TTL test | UAT 21 result showing automatic removal after window expiry | | |
| Collision test | Two-client key generation showing distinct keys | | |

## Notes / Risks

_None recorded._
