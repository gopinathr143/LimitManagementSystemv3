# STORY-01-02 — Client authentication and clientId derivation

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-01 — Tenancy Foundation](../epics/EPIC-01-tenancy-foundation.md) |
| **Status** | `Superseded` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 2.1.1 |
| **BRD UAT mapping** | UAT 26, UAT 27 |
| **Depends on** | STORY-01-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done` · `Superseded`
> When status changes, update **both** this file and `00-INDEX.md`.

## ⚠ Deliberate divergence from the BRD (recorded per this story's own DoD)

**Decision (2026-08-11): authentication is removed from this API.** The consuming systems are same-cluster, trusted internal callers — there is no network boundary between them and this service that a credential would meaningfully defend. `clientId` is now taken directly from the request path rather than derived from an authenticated principal.

This is a genuine reduction from the BRD's stated posture. BRD §2.1.1 calls authenticated-principal derivation "the load-bearing control preventing one tenant from reading or mutating another's counters, limits or audit records." With no credential, that specific claim no longer holds at the HTTP layer — **a caller can address any `clientId` simply by putting it in the URL.** What still holds, and is unchanged:

* An unknown or non-`ACTIVE` `clientId` is still rejected, fail-closed, before any further processing (`src/middleware/resolveClientId.middleware.js`) — this is STORY-01-04's contract, kept intact.
* The structural guard against a *clientId-less* query anywhere in the codebase (`TenantScopedRepository`, STORY-01-03) is unaffected — it protects against our own code accidentally omitting `clientId`, not against a caller supplying the wrong one.
* No secret material (there is none now) can leak, since there is none to leak. `authBinding` was removed from the `clients` schema entirely rather than left unused.

**What replaces credential-derived identity:** an optional, unverified `x-actor-id` header, recorded on audit trail entries for traceability (`configAudit`/`limitsAudit` `actor` field). It is explicitly **not** a security control — a caller can put anything in it — only an audit convenience. Default is `"unknown"` when absent.

**Planned reintroduction:** when this API is exposed to callers outside the trusted cluster, OAuth 2.0 with scoped tokens is the intended mechanism (the bank's own preference, communicated directly rather than through the BRD's original API-key/mTLS/OAuth open item). The reintroduction point is intentionally narrow: `src/middleware/resolveClientId.middleware.js` is the single place `clientId` resolution happens, and it is already structured as a factory taking a service dependency — swapping "read `req.params.clientId`" for "derive from a validated OAuth token's scope claim" touches that one file and nothing downstream (`req.tenant.clientId` remains the contract every controller/service already relies on).

**Original scope below is preserved for the record**, since it documents what a future OAuth reintroduction needs to satisfy again (AC2's payload/principal mismatch check, AC3's unauthenticated rejection, AC4's fingerprint-not-secret logging) — none of it is deleted, all of it is currently inapplicable.

## Description

~~Derive `clientId` from the authenticated principal (API key, mTLS certificate or OAuth client credential), never from a request body field.~~ **Superseded** — see divergence note above. `clientId` is now taken directly from the request path; see STORY-01-04 for the fail-closed existence/status check that remains.

## Acceptance Criteria (historical — not currently applicable)

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a valid authenticated principal bound to a registered client | any transaction or config request arrives | the engine resolves the clientId from the principal and proceeds |
| 2 | a request whose payload clientId differs from the authenticated principal | the request is submitted | it is rejected before validation, with no counter access and no audit mutation for either client |
| 3 | a request with no credential or an unrecognised credential | the request is submitted | it is rejected as unauthenticated and no clientId is resolved |
| 4 | a credential whose binding has been rotated or revoked | the request is submitted | it is rejected and the rejection is logged with the credential fingerprint but not the secret |

## Definition of Done

- [ ] ~~All Acceptance Criteria above pass~~ — not applicable; superseded by the no-auth decision
- [x] The replacement behaviour (`resolveClientId` middleware) has its own unit and integration coverage — `tests/unit/resolveClientId.middleware.test.js`, `tests/integration/registry.test.js` / `limitDefinition.test.js` (unknown/suspended clientId rejection cases)
- [ ] Code reviewed and approved by a second engineer
- [x] BRD section updated if implementation diverged from the written design — this file *is* that update; §2.1.1's authenticated-principal claim no longer holds for this deployment topology

## Notes / Risks

**If this service is ever reachable from outside the trusted cluster (a new consumer, a network topology change, a compliance requirement), this decision must be revisited before that exposure ships** — the current posture assumes a closed network boundary does the job a credential would otherwise do. The BRD's original open item (API key vs mTLS vs OAuth) is superseded by a concrete choice for the future: OAuth with scopes, reintroduced solely in `resolveClientId.middleware.js`.
