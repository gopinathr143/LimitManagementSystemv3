# STORY-02-03 — Window activation timing and warming state

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.3.2 |
| **BRD UAT mapping** | UAT 43 |
| **Depends on** | STORY-02-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Activating a window mid-period is fail-open, because a newly activated rolling or monthly counter starts from zero and under-counts until its window fills. Activation is therefore boundary-aligned by default, with an explicit warming opt-in that flags every affected decision in the audit.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a new monthly window declared mid-month | the registry is activated | the window is marked pending activation and is not enforced until the next month boundary in the client timezone |
| 2 | a new daily window declared mid-day | the registry is activated | it is not enforced until the next midnight in the client timezone |
| 3 | a window activated with the explicit warming opt-in | a transaction is evaluated | the window is enforced immediately and the audit record for that decision carries the warming state flag |
| 4 | a declared window that has passed its activation boundary | a transaction is evaluated | the window is enforced normally with no warming flag |
| 5 | a window being de-activated | the registry change is applied | enforcement stops immediately, since removing enforcement is safe in the fail-closed direction |

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
| Activation timing test | UAT 43 result for pending activation and boundary crossing | | |
| Warming audit sample | Audit record showing the warming state flag on a decision | | |
| Risk sign-off | Written acceptance from the risk owner that boundary-aligned activation is the default | | |

## Notes / Risks

This is the highest-risk configuration behaviour in the epic. It is the one place where a config edit could silently relax enforcement.
