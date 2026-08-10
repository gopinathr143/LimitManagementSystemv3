# STORY-01-03 — Tenant isolation across all data access

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-01 — Tenancy Foundation](../epics/EPIC-01-tenancy-foundation.md) |
| **Status** | `In Progress` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC2/AC3 pass locally against a real MongoDB replica set; AC1/AC4 are not fully provable until the counter engine (EPIC-03) and reversal API (EPIC-05) exist (see Notes)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/base.repository.test.js`, `tests/unit/tenantAuth.middleware.test.js` (`requireOwnClientParam`)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/tenantScopedRepository.test.js`, `tests/integration/tenantAuth.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — structured rejection logs are in place; no metrics emitter yet (see STORY-01-01 DoD note)
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified
- [x] A guard rejects any query built without a clientId predicate, verified by test — `TenantScopedRepository` (`src/repositories/base.repository.js`), proven in both unit and real-Mongo integration tests

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Isolation test | UAT 23 result showing independent counters under concurrent two-client load | Structural mechanism proven now: `tests/integration/tenantScopedRepository.test.js` — "AC1: two clients with identical keys stay fully independent under concurrent writes" (25 vs 10 concurrent increments on a shared key, against real Mongo). **Full UAT 23 with real `counters` documents is re-run once EPIC-03 lands**, since this collection is a stand-in for the future `counters` collection | |
| Access denial test | UAT 24 result showing cross-tenant read and write both refused | `tests/integration/tenantAuth.test.js` — "STORY-01-03 AC2: requesting another client's resource path is rejected with no data returned" | |
| Guard proof | Test showing a deliberately clientId-less query is rejected at runtime | `tests/unit/base.repository.test.js`; real-Mongo equivalent in `tests/integration/tenantScopedRepository.test.js` — "AC3" | |

## Notes / Risks

**AC1 and AC4 are only partially closed by this pass.** Both name concrete artifacts (`counters`, `limits`, transaction reversal) that don't exist until EPIC-03 (Counter Engine) and EPIC-05 (Reversal and Reconciliation) land. What ships now is the structural guarantee those epics will build on: every tenant-scoped repository extends `TenantScopedRepository` (`src/repositories/base.repository.js`), which stamps and requires `clientId` on every read/write and throws rather than allowing a clientId-less query through — proven here against a real replica set with a stand-in collection. AC1/AC4 should be re-verified against the real `counters` collection and the real reversal endpoint when those epics complete, rather than treated as closed by this story alone.

Onboarding a client is also gated by STORY-02-01 (registry snapshot), not yet implemented.
