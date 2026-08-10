# STORY-05-02 — Counter reconciliation sweeper

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-05 — Reversal and Reconciliation](../epics/EPIC-05-reversal-and-reconciliation.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.5 |
| **BRD UAT mapping** | UAT 36 |
| **Depends on** | STORY-05-01, STORY-04-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Compensation can itself fail, and a crashed request can leave increments nobody compensated, leaving a counter permanently inflated and silently over-rejecting real customers. Because the transaction collection records every applied counter key, counters are derivable and therefore repairable.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | injected counter drift from a failed compensation | the sweeper runs | the drift is detected, alerted, and the closed-window counter is corrected to the value derived from the transaction records |
| 2 | a failed decrement floor guard, a failed compensation or an abandoned claim | any of these occur | the affected key is queued for targeted reconciliation rather than waiting for the periodic sweep |
| 3 | an open window with drift | the sweeper runs | the drift is alerted first and auto-correction is applied only where policy permits, since silently rewriting a live risk counter is itself a risk |
| 4 | a sharded hot counter operating within its documented overshoot bound | the sweeper runs | no drift alert is raised, because the tolerance is set above the accepted bound |
| 5 | a closed window | the nightly pass runs | all counters for that window are verified against derived values |

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
| Drift repair test | UAT 36 result showing detection, alert and correction | | |
| False positive check | Result showing normal Tier 2 operation generates no drift noise | | |
| Runbook | Documented operator procedure for responding to a drift alert | | |

## Notes / Risks

_None recorded._
