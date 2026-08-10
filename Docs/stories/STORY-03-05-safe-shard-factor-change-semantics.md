# STORY-03-05 — Safe shard factor change semantics

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.2.6 |
| **BRD UAT mapping** | UAT 34 |
| **Depends on** | STORY-03-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Lowering a shard factor mid-window would orphan buckets whose balances silently drop out of the sum, under-counting velocity and over-approving. This is a fail-open direction and must be structurally prevented.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an open window and a lowered shard factor | the configuration change is applied | the change takes effect only at the next window boundary and the in-force value stays pinned for the open window |
| 2 | an open window whose shard factor changed | a total is read | the reader sums the maximum of the historical and current bucket counts so no bucket is orphaned |
| 3 | a shard factor change that would take effect mid-window | it is submitted | registry validation rejects it unless it is an increase and the reader-side maximum rule is in force |
| 4 | a transaction approved under one shard factor | it is later reversed | the reversal uses the shard factor recorded at approval time |

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
| Orphan prevention test | UAT 34 result showing the summed total does not drop after a lowering change | | |
| Over-approval check | Test confirming no transaction is approved that a correct total would have rejected | | |

## Notes / Risks

_None recorded._
