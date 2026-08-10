# STORY-04-02 — Stale pending claim reaper

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 3.1.1 |
| **BRD UAT mapping** | UAT 35 |
| **Depends on** | STORY-04-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

A process that crashes mid-waterfall leaves an orphaned pending claim that would otherwise block legitimate retries of that transaction forever. The reaper resolves stale claims to an abandoned state and refers them to reconciliation, because a crashed request may have applied increments it could not compensate.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an instance killed mid-waterfall leaving a pending claim | the configured staleness threshold elapses | the claim is transitioned to abandoned and a fresh retry of that identifier is accepted |
| 2 | an abandoned claim | the reaper completes | the transaction is referred to reconciliation so any orphaned increments are repaired |
| 3 | a healthy in-flight request within the staleness threshold | the reaper runs | the claim is left untouched and the request completes normally |
| 4 | the transactions collection | the reaper operates | claims are transitioned by status change and never deleted, preserving the audit record |

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
| Crash recovery test | UAT 35 result showing retry accepted after reaping | | |
| Non-interference test | Result showing healthy in-flight requests are not reaped | | |

## Notes / Risks

_None recorded._
