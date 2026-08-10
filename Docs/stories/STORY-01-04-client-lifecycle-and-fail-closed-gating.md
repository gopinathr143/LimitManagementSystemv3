# STORY-01-04 — Client lifecycle and fail-closed gating

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-01 — Tenancy Foundation](../epics/EPIC-01-tenancy-foundation.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 2.1.1, 2.1.2, 4.9 |
| **BRD UAT mapping** | UAT 26 |
| **Depends on** | STORY-01-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Reject traffic from unknown, inactive or suspended clients before any validation or counter access. This is the first fail-closed gate in the request path and must be unconditional.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an unregistered clientId | a transaction is submitted | the request is rejected before any counter read or write occurs |
| 2 | a client whose status is SUSPENDED | a transaction is submitted | the request is rejected and no counter is touched |
| 3 | a client suspended while requests are in flight | the next request arrives | it is rejected using the refreshed status without requiring a service restart |
| 4 | a suspended client that is reactivated | a transaction is submitted | it is processed normally against its existing counters |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/tenantAuth.middleware.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/tenantAuth.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — structured rejection logs are in place; no metrics emitter yet (see STORY-01-01 DoD note)
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Fail-closed test | UAT 26 result covering unknown and suspended clients | `tests/integration/tenantAuth.test.js` — "STORY-01-04 AC1" (unregistered), "AC2" (SUSPENDED), "AC3" (status change picked up without restart), "AC4" (reactivation) | |
| No side-effect proof | Counter documents unchanged after rejected requests, shown by before/after query | No counter engine exists yet (EPIC-03); the applicable proof today is that a rejected `tenantAuth` request never reaches a route handler at all (`next(AppError)` short-circuits before `req.tenant` is even set) — see the same test file | |

## Notes / Risks

There is currently no business route downstream of `tenantAuth` (limits/counters land in EPIC-02/EPIC-03), so this story's middleware is proven via a dedicated probe route (`tests/integration/helpers/tenantTestApp.js`) using the exact production `tenantAuth` + `requireOwnClientParam` chain. It will be re-exercised, not re-implemented, once real tenant routes exist.
