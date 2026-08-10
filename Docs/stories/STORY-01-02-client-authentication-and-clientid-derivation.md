# STORY-01-02 — Client authentication and clientId derivation

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-01 — Tenancy Foundation](../epics/EPIC-01-tenancy-foundation.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 2.1.1 |
| **BRD UAT mapping** | UAT 26, UAT 27 |
| **Depends on** | STORY-01-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Derive `clientId` from the authenticated principal (API key, mTLS certificate or OAuth client credential), never from a request body field. This is the load-bearing control for tenant isolation. If a payload also carries a clientId it must match the principal, otherwise the request is rejected.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a valid authenticated principal bound to a registered client | any transaction or config request arrives | the engine resolves the clientId from the principal and proceeds |
| 2 | a request whose payload clientId differs from the authenticated principal | the request is submitted | it is rejected before validation, with no counter access and no audit mutation for either client |
| 3 | a request with no credential or an unrecognised credential | the request is submitted | it is rejected as unauthenticated and no clientId is resolved |
| 4 | a credential whose binding has been rotated or revoked | the request is submitted | it is rejected and the rejection is logged with the credential fingerprint but not the secret |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Credentials and certificate fingerprints never appear in application logs

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Spoof test | Test output for UAT 27 showing payload/principal mismatch rejected | | |
| Security review | Sign-off from the security reviewer on the auth binding mechanism | | |
| Log inspection | Confirmation that no secret material appears in logs at any level | | |

## Notes / Risks

The choice of mechanism (API key vs mTLS vs OAuth) is an open item in the BRD and must be confirmed with the bank before this story starts.
