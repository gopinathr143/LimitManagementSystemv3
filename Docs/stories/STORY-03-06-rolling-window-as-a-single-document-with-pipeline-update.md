# STORY-03-06 — Rolling window as a single document with pipeline update

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 13 |
| **BRD reference** | Section 4.2.5 |
| **BRD UAT mapping** | UAT 31, UAT 32, UAT 1 |
| **Depends on** | STORY-03-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

The sliding 24-hour window is a single document per entity holding hourly sub-buckets, updated by an aggregation pipeline that prunes, sums and conditionally increments atomically. Spreading the total across separate documents would make strict enforcement impossible, so this design is what makes the per-entity rolling guarantee real.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | concurrent transactions against one entity rolling limit sized so only a fixed number fit | they are submitted simultaneously | exactly that number are approved and the rest rejected, with no overshoot |
| 2 | a rolling document containing sub-buckets older than the window horizon | the next update runs | expired sub-buckets are pruned in the same operation and the document stays bounded |
| 3 | a transaction that breaches the rolling limit | the pipeline update runs | the applied flag is false, the returned document carries exact current velocity, and no second read is required for the audit |
| 4 | a calendar day boundary crossing | a transaction breaching the rolling limit arrives | it is still rejected, because the rolling window does not reset with the calendar day |
| 5 | a dimension configured with minute granularity | transactions are processed | rolling precision tightens accordingly and the document remains within size limits |
| 6 | a hot dimension declaring a rolling window | traffic is processed | the rolling counter is sharded and reverts to the documented approximate semantics |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set, stable across 8 repeated runs of the concurrency test; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/rollingCounter.model.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/counterEngine.rolling.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — no metrics emitter yet (see EPIC-01/02 DoD notes)
- [x] BRD section updated if implementation diverged from the written design — see Notes below: the BRD's own pipeline sketch (§4.2.5) is pseudocode, not a literal MongoDB expression, and the real pipeline built here differs from it in exactly the ways needed to actually run
- [x] MongoDB 5.0 or later is confirmed in every environment, since pipeline updates are a hard platform requirement — the dev/test environment (docker-compose, `mongo:7`) runs **MongoDB 7.0.39**, confirmed via `db.version()` before this story started. Other environments (staging/prod) are not yet provisioned and must be confirmed before go-live

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Strictness test | UAT 31 result showing exactly the expected approval count with zero overshoot | `tests/integration/counterEngine.rolling.test.js` — "AC1/UAT 1: exactly K of N concurrent requests are approved against one entity, zero overshoot" (30 concurrent requests, entity sized for exactly 10), run 8 times consecutively with zero failures | |
| Pruning test | UAT 32 result showing bounded document size over a simulated multi-day run | `tests/integration/counterEngine.rolling.test.js` — "AC2/UAT 32" seeds 30 hourly buckets (spanning well past the 24h horizon) directly into a document, then proves the very next pipeline update prunes it back to ≤25 buckets in the same operation | |
| Platform confirmation | Recorded MongoDB version for each environment | Local/CI dev: `mongo:7` (7.0.39), confirmed via `db.version()`. Staging/production: not yet provisioned — must be confirmed before this story can be marked `Done` | |

## Notes / Risks

Largest single story in the backlog. MongoDB 7.0 is in use locally, comfortably clear of the 5.0 floor.

**BRD divergence, worth recording explicitly:** BRD §4.2.5's own pipeline snippet (`{ $sum: "$buckets.a" }` against `buckets` as a plain keyed object) is illustrative pseudocode — a real `$sum` accumulator needs an actual array of numbers, and a field path into an object keyed by dynamic hour labels doesn't resolve that way. The pipeline actually built (`src/models/rollingCounter.model.js`) does the real `$objectToArray` → `$map` → `$sum` conversion the sketch elides, and applies the conditional merge via `$mergeObjects` rather than a bare `$cond` on a dynamic dotted path. This was caught and fixed by directly executing the pipeline against real MongoDB before writing the test suite, not by code review alone.

`rollingPipelineUpdate`'s upsert has the same theoretical benign-E11000 race as Tier 2's shard bootstrap (concurrent first-writers to a not-yet-existing document) — applied the same fix pre-emptively (retry the identical call once on E11000, `src/repositories/counter.repository.js`) based on the lesson from STORY-03-04, rather than waiting to reproduce it here. The 8-run concurrency test never surfaced this race in practice, which is consistent with (not proof of) the fix holding.
