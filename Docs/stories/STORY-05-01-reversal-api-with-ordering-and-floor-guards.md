# STORY-05-01 — Reversal API with ordering and floor guards

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-05 — Reversal and Reconciliation](../epics/EPIC-05-reversal-and-reconciliation.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.4 |
| **BRD UAT mapping** | UAT 9, UAT 10, UAT 17, UAT 44 |
| **Depends on** | STORY-04-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Reverse an approved transaction by decrementing the exact counter documents recorded at approval. The status flip is attempted first so two concurrent reversal calls cannot both decrement, and decrements are guarded so a counter can never go negative.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an approved transaction | reversal is called | the exact recorded counter documents including the specific shard bucket are decremented and the status becomes reversed |
| 2 | the same transaction | reversal is called a second time | the second call is a no-op with no double decrement |
| 3 | two concurrent reversal calls for one transaction | both arrive simultaneously | the status flip succeeds once and only that caller applies decrements |
| 4 | a transaction that is rejected, already reversed or non-existent | reversal is called | the call is a no-op or error response and no counter is touched |
| 5 | a dimension or window de-activated in the registry after approval | reversal is called | the now-ungoverned counter is skipped and logged without error, while other recorded counters are still decremented |
| 6 | a decrement that would drive a counter below zero | it is attempted | the floor guard prevents it and the condition is recorded as a drift signal |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally (6 consecutive runs of the full suite, including 3 back-to-back runs of the concurrency test) against a real MongoDB replica set; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — covered via the integration suite (reversal is a real end-to-end orchestration over the transaction/counter repositories and the registry cache, not meaningfully unit-testable in isolation from them, same reasoning as STORY-04-03)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/transaction.reversal.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — floor-guard failures are logged at error level and queued for reconciliation (STORY-05-02); no metrics emitter yet (see EPIC-01–04 DoD notes — an existing, carried-forward gap)
- [x] BRD section updated if implementation diverged from the written design — one deliberate divergence, recorded below: the reversal key omits the `direction` segment BRD §3.4 names, since EPIC-08 (direction scoping) has not landed yet

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Reversal test | UAT 9 result showing exact bucket decrement | `tests/integration/transaction.reversal.test.js` — "AC1: reversal decrements the exact recorded documents (tier1 plain key and tier2 specific shard bucket)..." — asserts the specific shard document (not the aggregate) is what changed | |
| Idempotency test | UAT 10 result for the repeated call | `tests/integration/transaction.reversal.test.js` — "AC2: a repeated reversal call is a no-op with no double decrement" | |
| De-activation test | UAT 44 result showing skip without error | `tests/integration/transaction.reversal.test.js` — "AC5: a dimension de-activated in the registry after approval is skipped by reversal without erroring, while other recorded counters still decrement" | |
| Concurrency test | Result showing only one of two simultaneous reversals applies decrements | `tests/integration/transaction.reversal.test.js` — "AC3: two concurrent reversal calls for one transaction — only one applies decrements", re-run 3x consecutively clean | |

## Notes / Risks

**Divergence, recorded per this story's own DoD:** BRD §3.4 keys the reversal lookup on `(clientId, direction, transactionId)`. EPIC-08 (direction scoping) has not been built yet — the transaction identity throughout this codebase is still the EPIC-04 `{clientId, transactionId}` compound key. `reverseIfApproved` therefore uses that same key. This is the same, already-accepted sequencing gap noted in `00-INDEX.md`'s open items (STORY-08-02 is explicitly scheduled to land the direction segment in both the counter key and the transaction identity before INWARD is enabled); reversal will pick up `direction` automatically once STORY-08-02 lands, with no separate rework.

**Reversal reuses STORY-04-04's compensation primitives directly** (`CounterEngineService.compensateTier1` / `compensateRolling`, `TransactionService#compensateOne`) rather than re-implementing the decrement — this is the "second consumer of an already-proven contract" STORY-04-05's notes anticipated. The one piece of policy specific to reversal (BRD §3.4 point 2 — skip a de-activated dimension/window without erroring) is implemented as a small registry-lookup guard (`#isCounterKeyGoverned`) that the saga rollback path doesn't need (a live in-flight request's own dimension/window can't have been de-activated mid-request).

**Floor-guard failures are queued for reconciliation, not just logged** — this was designed and implemented together with STORY-05-02 (`TransactionService` accepts an optional `reconciliationService`), so both stories close in the same PR.
