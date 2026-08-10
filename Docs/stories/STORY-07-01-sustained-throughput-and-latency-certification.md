# STORY-07-01 — Sustained throughput and latency certification

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-07 — Performance and Acceptance Certification](../epics/EPIC-07-performance-and-acceptance-certification.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.1 |
| **BRD UAT mapping** | UAT 5 |
| **Depends on** | STORY-04-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Demonstrate the sustained load target with the end to end latency envelope and the internal engine budget held, using a realistic mix of dimensions and windows rather than a single trivial path.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a realistic transaction mix across all declared dimensions and windows | sustained target load is applied | end to end response time stays within the stated envelope |
| 2 | the same run | internal timings are measured | the limit check and datastore operations stay within the internal engine budget on the happy path |
| 3 | the claim write added by the idempotency mutex | load is applied | its cost is measured and confirmed to fit within the internal budget |
| 4 | the load run | configuration reads are profiled | no configuration read occurs on the transaction path |

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
| Load test report | UAT 5 result with throughput, end to end and internal latency percentiles | | |
| Breakdown | Per-tier latency attribution showing where the budget is spent | | |

## Notes / Risks

_None recorded._
