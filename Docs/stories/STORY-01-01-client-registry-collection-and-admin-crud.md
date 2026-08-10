# STORY-01-01 — Client registry collection and admin CRUD

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-01 — Tenancy Foundation](../epics/EPIC-01-tenancy-foundation.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 2.1.2, 4.4 |
| **BRD UAT mapping** | UAT 28 |
| **Depends on** | None |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Create the `clients` collection and the admin-only endpoints to onboard and manage tenants. A client record carries its identity, status, authentication binding and timezone. This is the root of the tenancy model, so it lands before anything that consumes a `clientId`.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an admin caller with the admin role | they POST a valid client payload to /clients | the client is persisted with status ACTIVE, a unique clientId, and createdBy or createdAt audit fields populated |
| 2 | an existing clientId | an admin POSTs the same clientId again | the request is rejected with a conflict error and no second record is created |
| 3 | a caller holding only a tenant role (not admin) | they call any /clients endpoint | the request is rejected as unauthorised and no client data is returned |
| 4 | a client payload with an invalid IANA timezone | an admin submits it | validation rejects it and names the offending field |
| 5 | an existing client | an admin PATCHes status to SUSPENDED | the change is persisted and written to the configuration audit trail with actor and timestamp |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set (docker-compose `rs0`); not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/client.service.test.js`, `tests/unit/client.model.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/client.admin.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — structured logs via pino are in place (`src/config/logger.js`); no metrics emitter (e.g. prom-client counters) has been added yet
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified
- [x] Admin role is enforced by a separate credential from tenant API credentials — `ADMIN_API_KEYS` env-configured, disjoint from per-client `authBinding.apiKeyHash` (`src/middleware/adminAuth.middleware.js`)

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Integration test run | CI job link showing the client CRUD suite green | Local: `yarn test:integration` → `tests/integration/client.admin.test.js` (5/5 passing against docker-compose `rs0`); no CI job exists yet | |
| Role separation proven | Test output showing a tenant-role token rejected on /clients | `tests/integration/client.admin.test.js` — "AC3: a non-admin caller is rejected on every /clients endpoint" | |
| Audit trail | Sample audit record for a status change, showing actor and before/after | `tests/integration/client.admin.test.js` — "AC5: PATCH status to SUSPENDED..."; entries land in `configAudit` (`src/models/configAudit.model.js`) | |

## Notes / Risks

Onboarding a client is also gated by STORY-02-01 (registry snapshot). A client with no registry must not be usable. **STORY-02-01 is not yet implemented**, so a newly onboarded client currently has no dimension registry — this is expected at this stage of delivery, not a defect in this story.
