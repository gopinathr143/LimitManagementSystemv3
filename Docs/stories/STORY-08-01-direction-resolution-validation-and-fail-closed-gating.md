# STORY-08-01 — Direction resolution validation and fail-closed gating

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `In Review` |
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

- [x] All Acceptance Criteria below pass in a shared (non-local) environment — same real-MongoDB-replica-set standard used by every prior epic; not a separately provisioned shared environment (none exists in this session)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/transaction.service.test.js` "STORY-08-01 AC1/AC2/AC3" fake-repository suite
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/direction.test.js` "STORY-08-01" suite
- [ ] Code reviewed and approved by a second engineer — no second engineer exists in this session
- [x] Structured logs and metrics emitted per Section 4.11 of the BRD — `logger.warn` on the not-enabled rejection path (`transaction.service.js`); the missing/unrecognised paths throw before any logging is meaningful, matching `AppError`'s existing pattern
- [x] BRD section updated if implementation diverged from the written design — no divergence; implemented exactly as specified (payload-sourced, never defaulted, validated against the client's enabled set)

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Fail-closed test | UAT 49 result covering missing, unrecognised and not-enabled direction | `tests/integration/direction.test.js` "STORY-08-01 — direction resolution, validation and fail-closed gating" AC1/AC2/AC3 (all three rejection paths proven end-to-end against real MongoDB, including that no counter document is ever created) | |
| No-default proof | Test confirming an absent direction is never treated as outward | Same suite, AC1 — asserts `err.code === 'DIRECTION_REQUIRED'` and zero counter documents written | |

## Notes / Risks

Direction differs fundamentally from the client identifier in trust model. The client identifier comes from the principal and is never trusted from the payload. Direction must come from the payload and therefore needs its own validation against the enabled set.

**Implementation note:** the not-enabled check (AC3) is deliberately performed by `TransactionService.submit()` itself against `req.tenant.enabledDirections` (resolved fresh per-request by `resolveClientId` middleware from the client document), not baked into `validateTransactionRequest`'s structural validation — a direction can be structurally valid (AC2 passes) yet still rejected for this specific client (AC3), and the two failure reasons are kept distinguishable (`DIRECTION_UNRECOGNIZED` vs `DIRECTION_NOT_ENABLED`) rather than collapsed into one generic error.
