# STORY-04-02 — Stale pending claim reaper

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
| **Status** | `In Review` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — covered via integration tests directly against real Mongo (no separate unit-level fakes needed; the reaper's logic is entirely query/guarded-update based, not meaningfully separable from the database)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/staleClaimReaper.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — reaper volume is logged per abandoned claim (`src/services/staleClaimReaper.service.js`); §4.11's "stale-PENDING reaper volume" metric is not yet wired to a metrics emitter (see EPIC-01/02/03 DoD notes)
- [x] BRD section updated if implementation diverged from the written design — no divergence; `needsReconciliation: true` added to the abandoned document as the explicit hand-off point BRD §3.5 describes, ahead of EPIC-05's reconciliation sweeper existing to consume it

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Crash recovery test | UAT 35 result showing retry accepted after reaping | `tests/integration/staleClaimReaper.test.js` — "AC1/UAT 35: a claim older than the staleness threshold is abandoned, freeing the transactionId for a fresh retry" | |
| Non-interference test | Result showing healthy in-flight requests are not reaped | `tests/integration/staleClaimReaper.test.js` — "AC3: a healthy in-flight claim within the threshold is left untouched" and "a claim that resolves normally between the reaper scan and its write is left untouched (guarded transition)" | |

## Notes / Risks

**Reconciliation referral (AC2) is a hand-off, not a repair.** EPIC-05's reconciliation sweeper (STORY-05-02) does not exist yet, so an abandoned claim's `needsReconciliation: true` flag is currently only a marker — nothing consumes it to actually repair orphaned counter increments. This is the intended interim state per the BRD's own epic sequencing (EPIC-04 before EPIC-05); the flag is the contract EPIC-05 will query against.
