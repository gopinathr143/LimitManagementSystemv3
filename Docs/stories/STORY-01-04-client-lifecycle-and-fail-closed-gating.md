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

> **Note (2026-08-11):** per [STORY-01-02](STORY-01-02-client-authentication-and-clientid-derivation.md), authentication was removed from this API (same-cluster trusted callers). This story's gate is **unaffected and unchanged in substance** — it never depended on authentication, only on `clientId` (however obtained) resolving to a known, `ACTIVE` client. It is now implemented in `src/middleware/resolveClientId.middleware.js` rather than the former `tenantAuth.middleware.js`, and it is now the *only* gate in the request path (there is no credential check above it), which makes it more load-bearing than before, not less.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an unregistered clientId | a transaction is submitted | the request is rejected before any counter read or write occurs |
| 2 | a client whose status is SUSPENDED | a transaction is submitted | the request is rejected and no counter is touched |
| 3 | a client suspended while requests are in flight | the next request arrives | it is rejected using the refreshed status without requiring a service restart |
| 4 | a suspended client that is reactivated | a transaction is submitted | it is processed normally against its existing counters |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/resolveClientId.middleware.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/registry.test.js`, `tests/integration/limitDefinition.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — structured rejection logs are in place; no metrics emitter yet (see STORY-01-01 DoD note)
- [x] BRD section updated if implementation diverged from the written design — see note above and STORY-01-02 (the gate itself is unchanged; only its position in the middleware chain moved)

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Fail-closed test | UAT 26 result covering unknown and suspended clients | `tests/unit/resolveClientId.middleware.test.js` (unknown → 404, SUSPENDED → 403); `tests/integration/registry.test.js` — "STORY-01-04: an unknown clientId is rejected..." / "...a SUSPENDED client is rejected"; `tests/integration/limitDefinition.test.js` — "STORY-01-04: an unregistered clientId is rejected before any limits access" | |
| No side-effect proof | Counter documents unchanged after rejected requests, shown by before/after query | No counter engine exists yet (EPIC-03); the applicable proof today is that a rejected `resolveClientId` request never reaches a route handler at all (`next(AppError)` short-circuits before `req.tenant` is even set) — see the same test files | |

## Notes / Risks

Real tenant business routes now exist (`/clients/:clientId/dimensions`, `/clients/:clientId/limits` from EPIC-02), so this gate is exercised directly through them rather than through a standalone probe route.
