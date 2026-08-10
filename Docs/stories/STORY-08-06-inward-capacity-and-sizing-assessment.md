# STORY-08-06 — INWARD capacity and sizing assessment

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.5, 4.1, 4.7 |
| **BRD UAT mapping** | None (planning) |
| **Depends on** | STORY-08-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Enabling inward adds an independent counter set and an independent claim and audit write stream. Capacity is additive rather than free, so the throughput target must be restated and the storage projections revisited before inward is switched on.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the stated throughput target | inward enablement is planned | the target is restated explicitly as either per direction or combined and recorded in the specification |
| 2 | audit storage projections | inward volume is added | revised daily document and storage growth figures are produced and reviewed against the retention design |
| 3 | hot dimensions in each direction | sizing is reviewed | shard factors are set per direction from that direction measured rate rather than copied from outward |
| 4 | the sizing assessment | it is completed | infrastructure sign-off is recorded before inward traffic is accepted |

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
| Restated target | Written throughput target with the per-direction or combined basis stated | | |
| Revised sizing | Updated storage and IOPS projections including inward | | |
| Sign-off | Infrastructure acceptance recorded | | |

## Notes / Risks

_None recorded._
