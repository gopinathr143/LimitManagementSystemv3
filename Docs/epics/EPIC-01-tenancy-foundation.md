# EPIC-01 — Tenancy Foundation

| Field | Value |
| :--- | :--- |
| **Status** | `In Review` |
| **Stories** | 4 |
| **Total estimate (pts)** | 24 |
| **Completed** | 0 / 4 |

## Goal

Establish the client as a first-class tenant so every downstream feature is client-scoped from the first line of code, and onboarding a second client is a data operation rather than a migration.

## Definition of success

A request cannot reach the validation engine without a resolved, ACTIVE `clientId`, and no query anywhere in the codebase can read or write data without that `clientId` in its predicate.

> **Divergence (2026-08-11):** the goal above originally read "...resolved, *authenticated*, ACTIVE `clientId`...". Authentication was deliberately removed — consumers are trusted same-cluster callers; `clientId` is taken directly from the request path. See [STORY-01-02](../stories/STORY-01-02-client-authentication-and-clientid-derivation.md) for the full rationale and the planned OAuth reintroduction point if this ever changes. Existence-and-`ACTIVE` validation (STORY-01-04) and the structural clientId-predicate guard (STORY-01-03) are both unchanged.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-01-01](../stories/STORY-01-01-client-registry-collection-and-admin-crud.md) | Client registry collection and admin CRUD | Must | 5 | `In Review` |
| [STORY-01-02](../stories/STORY-01-02-client-authentication-and-clientid-derivation.md) | Client authentication and clientId derivation | Must | 8 | `Superseded` |
| [STORY-01-03](../stories/STORY-01-03-tenant-isolation-across-all-data-access.md) | Tenant isolation across all data access | Must | 8 | `In Progress` |
| [STORY-01-04](../stories/STORY-01-04-client-lifecycle-and-fail-closed-gating.md) | Client lifecycle and fail-closed gating | Must | 3 | `In Review` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
