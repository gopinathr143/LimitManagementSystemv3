# STORY-03-05 — Safe shard factor change semantics

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `In Review` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/shardFactorSafety.test.js`
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock) — the safety rule itself is pure registry-validation logic (no I/O), fully unit-tested; its consumption by real counter reads/writes is proven end-to-end in `tests/integration/counterEngine.tier2.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — no metrics emitter yet (see EPIC-01/02 DoD notes)
- [x] BRD section updated if implementation diverged from the written design — see Notes below for one interpretation call between this story's AC3 wording and BRD §4.2.6's normative text

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Orphan prevention test | UAT 34 result showing the summed total does not drop after a lowering change | `tests/unit/shardFactorSafety.test.js` — "AC2: after the boundary passes, the reader still sums max(historical, current)" | |
| Over-approval check | Test confirming no transaction is approved that a correct total would have rejected | `tests/unit/shardFactorSafety.test.js` — "AC1/AC3: a decrease is scheduled for the next boundary, never immediate" (both read and write resolvers return the old, larger value until the boundary passes) | |

## Notes / Risks

**Interpretation call, recorded per this story's own DoD:** AC3 as written says registry validation "rejects" a mid-window decrease. BRD §4.2.6's normative text describes *deferral* as the mechanism ("takes effect only at the next window boundary; the in-force value is pinned"), not rejection of the submission. Implemented per the BRD (the source specification): a decrease is always accepted but its effect is deferred to the next boundary via an append-only `shardFactorHistory` on the window entry (`src/models/registry.model.js`) — there is no caller-facing input path to force an immediate decrease at all, so "rejects a change that would take effect mid-window" is satisfied structurally rather than via an explicit runtime error. History is intentionally never pruned (a shardFactor increase from months ago stays in the "historical max" forever) — this only costs summing a few permanently-empty extra bucket keys, never under-counts, and shardFactor changes are rare enough that this is not a real growth concern.
