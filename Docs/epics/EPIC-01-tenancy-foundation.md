# EPIC-01 — Tenancy Foundation

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 4 |
| **Total estimate (pts)** | 24 |
| **Completed** | 0 / 4 |

## Goal

Establish the client as a first-class tenant so every downstream feature is client-scoped from the first line of code, and onboarding a second client is a data operation rather than a migration.

## Definition of success

A request cannot reach the validation engine without a resolved, authenticated, ACTIVE `clientId`, and no query anywhere in the codebase can read or write data without that `clientId` in its predicate.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-01-01](../stories/STORY-01-01-client-registry-collection-and-admin-crud.md) | Client registry collection and admin CRUD | Must | 5 | `Not Started` |
| [STORY-01-02](../stories/STORY-01-02-client-authentication-and-clientid-derivation.md) | Client authentication and clientId derivation | Must | 8 | `Not Started` |
| [STORY-01-03](../stories/STORY-01-03-tenant-isolation-across-all-data-access.md) | Tenant isolation across all data access | Must | 8 | `Not Started` |
| [STORY-01-04](../stories/STORY-01-04-client-lifecycle-and-fail-closed-gating.md) | Client lifecycle and fail-closed gating | Must | 3 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
