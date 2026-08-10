# STORY-01-03 — Tenant isolation across all data access

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-01 — Tenancy Foundation](../epics/EPIC-01-tenancy-foundation.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 2.1.3, 4.2 |
| **BRD UAT mapping** | UAT 23, UAT 24 |
| **Depends on** | STORY-01-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Enforce that every collection carries a clientId discriminator and that every query, key and index leads with clientId. Implement this as a shared data-access layer so isolation is structural rather than a rule each developer must remember.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | two clients with identical dimension codes and identical transaction identifiers | both submit traffic concurrently | their counters, limits and audit records remain fully independent and neither client's velocity is affected by the other |
| 2 | a caller authenticated as client A | they request a resource path naming client B | the request is rejected with no data returned and no mutation performed |
| 3 | any repository method in the codebase | a static or runtime check inspects the query predicate | the predicate contains a clientId term, and a query without one fails fast rather than returning cross-tenant data |
| 4 | client A approved a transaction | client A reverses it | only client A counters are decremented and client B counters are untouched |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] A guard rejects any query built without a clientId predicate, verified by test

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Isolation test | UAT 23 result showing independent counters under concurrent two-client load | | |
| Access denial test | UAT 24 result showing cross-tenant read and write both refused | | |
| Guard proof | Test showing a deliberately clientId-less query is rejected at runtime | | |

## Notes / Risks

_None recorded._
