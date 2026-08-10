# STORY-07-02 — Hot counter concurrency certification

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-07 — Performance and Acceptance Certification](../epics/EPIC-07-performance-and-acceptance-certification.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.1, 4.2.2, 4.2.4 |
| **BRD UAT mapping** | UAT 19, UAT 22 |
| **Depends on** | STORY-03-04, STORY-03-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Prove the central engineering claim of this design: that a single logical counter can absorb the full request rate because it is split across shard buckets, and that the resulting approximation stays inside its documented bound.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a single logical hot counter | the full target increment rate is driven at it | no individual document exceeds a safe per-document write rate and write conflict retries stay within budget |
| 2 | the same run | latency is measured | internal p99 stays within the budget rather than degrading as contention rises |
| 3 | the same run | overshoot is measured | it stays within the documented bound and the measured figure is recorded in the BRD |
| 4 | shard factor tuning | it is adjusted | the effect on write conflict rate and read cost is measured and the chosen values are justified |

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
| Hot counter report | UAT 19 result with per-document write rates and conflict metrics | | |
| Overshoot figure | Measured bound recorded against the documented claim | | |
| Tuning rationale | Recorded justification for the shard factor values chosen per dimension | | |

## Notes / Risks

_None recorded._
