# STORY-03-04 — Tier 2 sharded counters with cached totals

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `In Review` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC1/AC2/AC3/AC5/AC6 pass locally against a real MongoDB replica set; AC4's "1,000 RPS" load figure is a certification concern for EPIC-07, not this story (see Notes)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/counterRepository.readWritePolicy.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/counterEngine.tier2.test.js`, stable across 8 repeated runs
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — no metrics emitter yet (see EPIC-01/02 DoD notes); overshoot measurement and hot-counter write-rate are named §4.11 metrics not yet wired
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Hot load test | UAT 19 result with per-document write rate and p99 internal latency | Partial: `tests/integration/counterEngine.tier2.test.js` — "AC1: writes spread across shard buckets" proves distribution (200 concurrent writes across ≤16 documents, no single shard absorbing them all). **The 1,000 RPS / p99 latency certification itself is EPIC-07's job** (STORY-07-01/07-02), not this story's — this story proves the mechanism is correct, not that it's fast at scale | |
| Sum correctness test | UAT 20 result including reversal effect on the summed total | `tests/integration/counterEngine.tier2.test.js` — "AC2" (exact sum after 50 approvals) and "AC3" (reversal decrements the recorded bucket, sum reduces correctly) | |
| Overshoot measurement | UAT 22 result quantifying observed overshoot against the documented bound | `tests/integration/counterEngine.tier2.test.js` — "AC4" asserts the stored total exactly equals `approvedCount × txnAmount` (no phantom increments) and stays within the theoretical worst-case bound; a real 1,000 RPS overshoot measurement under sustained load is EPIC-07's job | |

## Notes / Risks

A concurrency bug was found and fixed while building this story's tests: `incrementShardUnconditional`'s combined bootstrap-and-increment upsert can race under concurrent first-writers to the same not-yet-existing shard (the same benign-E11000 class of race Tier 1's bootstrap step has), but unlike Tier 1's bootstrap, the increment must never be silently dropped on the losing side. Fixed by retrying the identical call once on E11000 (`src/repositories/counter.repository.js`) — reproduced reliably via repeated concurrency runs before the fix, absent after.

Depends on STORY-03-05 (safe shardFactor change) for the shard-count resolution used on every read/write — implemented together.
