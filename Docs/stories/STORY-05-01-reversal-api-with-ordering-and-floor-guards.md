# STORY-05-01 — Reversal API with ordering and floor guards

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-05 — Reversal and Reconciliation](../epics/EPIC-05-reversal-and-reconciliation.md) |
| **Status** | `Not Started` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Reversal test | UAT 9 result showing exact bucket decrement | | |
| Idempotency test | UAT 10 result for the repeated call | | |
| De-activation test | UAT 44 result showing skip without error | | |
| Concurrency test | Result showing only one of two simultaneous reversals applies decrements | | |

## Notes / Risks

_None recorded._
