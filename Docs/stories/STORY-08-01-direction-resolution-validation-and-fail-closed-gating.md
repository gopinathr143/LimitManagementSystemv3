# STORY-08-01 — Direction resolution validation and fail-closed gating

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 2.1.5, 2.1.6, 2.1.8 |
| **BRD UAT mapping** | UAT 49 |
| **Depends on** | STORY-01-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Direction is an explicit mandatory request field, because unlike the client identifier it cannot be derived from the authenticated principal. The same client submits both directions over the same credential. Defaulting an absent direction would silently mis-scope traffic into the wrong counters, so absence must be a rejection.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a request with no direction field | it is submitted | it is rejected before any validation or counter access and is never defaulted to outward |
| 2 | a request with an unrecognised direction value | it is submitted | it is rejected with a clear error naming the accepted values |
| 3 | a direction that is valid but not enabled for that client | a transaction is submitted | it is rejected even though the direction is valid in principle |
| 4 | a client with a direction enabled | a transaction for that direction arrives | it is processed against that direction registry and limit definitions |
| 5 | any processed request | its audit record is written | the resolved direction is recorded on the record |

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
| Fail-closed test | UAT 49 result covering missing, unrecognised and not-enabled direction | | |
| No-default proof | Test confirming an absent direction is never treated as outward | | |

## Notes / Risks

Direction differs fundamentally from the client identifier in trust model. The client identifier comes from the principal and is never trusted from the payload. Direction must come from the payload and therefore needs its own validation against the enabled set.
