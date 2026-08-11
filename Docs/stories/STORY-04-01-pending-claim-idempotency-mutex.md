# STORY-04-01 — Pending claim idempotency mutex

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.1 |
| **BRD UAT mapping** | UAT 8, UAT 30 |
| **Depends on** | STORY-01-03 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

The transaction record is written as a pending claim before any validation or counter access, so the unique compound index acts as a true mutex. Checking for existence before validation but writing only afterwards allows two concurrent retries to both run the waterfall and both increment counters, which is the defect this story closes.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | many concurrent requests carrying an identical client and transaction identifier | they are submitted simultaneously | exactly one runs the waterfall, counters are incremented exactly once in total, and the final counter value matches a single transaction |
| 2 | a transaction already resolved as approved, rejected or reversed | the same identifier is submitted again | the stored result is returned verbatim with no re-validation and no counter access |
| 3 | a transaction currently held in the pending state by another request | the same identifier is submitted | an in-progress response is returned and the request never proceeds to the counter path |
| 4 | two different clients using the same transaction identifier | both submit | both are processed independently and neither resolves to the other stored result |
| 5 | a claim that succeeds | the waterfall completes | the claim is updated in place to the final status with applied counter keys attached |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set, stable across 6 repeated runs of the concurrency test; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/transaction.service.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/transaction.idempotency.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — structured logs are in place (claim/resolve events); decision counters and `409` rate named in §4.11 are not yet wired to a metrics emitter (see EPIC-01/02/03 DoD notes)
- [x] BRD section updated if implementation diverged from the written design — no divergence; implements §3.1 exactly (claim before validation, compound `_id` mutex, guarded resolve)
- [x] The compound client and transaction identifier is the document primary key so the mutex needs no secondary index — `_id: {clientId, transactionId}` (`src/models/transaction.model.js`); `TransactionRepository` has no secondary unique index for this purpose

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Concurrency test | UAT 30 result proving counters increment exactly once under N concurrent duplicates | `tests/integration/transaction.idempotency.test.js` — "AC1/UAT 30: many concurrent identical requests..." (25 concurrent identical requests, counter reflects exactly one), run 6 times consecutively with zero failures | |
| Sequential idempotency | UAT 8 result for the simple repeat case | `tests/integration/transaction.idempotency.test.js` — "AC2/UAT 8: a sequential repeat..." | |
| Cross-client test | Result showing identical identifiers across clients do not cross-resolve | `tests/integration/transaction.idempotency.test.js` — "AC4: two different clients using the same transactionId are processed independently" | |

## Notes / Risks

Corrects a defect present in BRD v3 and v4. The consumer contract gains a new in-progress response (`409 TRANSACTION_IN_PROGRESS`) — implemented as documented; no external consumer teams exist yet to notify (pre-first-deploy).
