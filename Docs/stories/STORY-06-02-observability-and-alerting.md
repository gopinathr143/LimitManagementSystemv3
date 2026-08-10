# STORY-06-02 — Observability and alerting

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.11 |
| **BRD UAT mapping** | None (operational) |
| **Depends on** | STORY-04-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Expose the metrics that reveal silent enforcement corruption early, per client and per dimension and window. Compensation failure rate and counter drift are the two leading indicators that the system is quietly deciding wrongly.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the service under load | metrics are scraped | decision counts, rejections broken down by breached dimension window and metric, in-progress responses and error rates are all exposed per client |
| 2 | compensation failures or counter drift occurring | the condition arises | it is surfaced as a metric and raises an alert, since these indicate silent enforcement corruption |
| 3 | write conflict rate and retry exhaustion rising on a counter tier | the trend develops | it is visible per tier and alerts before it breaches the latency budget, giving early warning that a shard factor is undersized |
| 4 | latency measurement | it is collected | p50, p95 and p99 are reported per counter tier as well as end to end |
| 5 | replication lag on the primary path | it exceeds tolerance | an alert fires, because a stale counter read causes over-approval |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] On-call runbooks exist for every alert defined in this story

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Dashboard | Link to the dashboard showing all required metric families | | |
| Alert test | Evidence of each alert firing in a controlled test | | |
| Runbook review | Sign-off from the on-call owner | | |

## Notes / Risks

_None recorded._
