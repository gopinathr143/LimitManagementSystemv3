# STORY-03-04 — Tier 2 sharded counters with cached totals

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.2.2, 4.2.3, 4.2.4 |
| **BRD UAT mapping** | UAT 19, UAT 20, UAT 22 |
| **Depends on** | STORY-03-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Hot low-cardinality counters are split into shard buckets so no single document absorbs the full write rate. Totals are read as the sum across buckets, served from a short-lived in-process cache on the hot path. These limits are explicitly approximate with a bounded overshoot.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a hot dimension under 1000 increments per second at one logical counter | load is sustained | writes spread across the configured shard buckets and no single document exceeds a safe per-document write rate |
| 2 | a known number of approved transactions against a sharded counter | the buckets are summed | the total amount and count match the expected values exactly |
| 3 | a reversal of a transaction that incremented a sharded counter | the reversal is processed | the specific recorded bucket is decremented and the summed total reduces correctly |
| 4 | a hot counter under high concurrency | the limit is approached | any overshoot stays within the documented bound and is measured rather than assumed |
| 5 | a hot counter total served from cache | the refresh interval elapses | the cached value is refreshed and staleness never exceeds the configured interval |
| 6 | a low-volume client declaring the same dimension as not hot | traffic is processed | no sharding is applied and the counter uses the strict path |

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
| Hot load test | UAT 19 result with per-document write rate and p99 internal latency | | |
| Sum correctness test | UAT 20 result including reversal effect on the summed total | | |
| Overshoot measurement | UAT 22 result quantifying observed overshoot against the documented bound | | |

## Notes / Risks

_None recorded._
