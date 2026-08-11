# STORY-03-07 — Read preference and write concern policy

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `In Progress` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.6 |
| **BRD UAT mapping** | UAT 37 |
| **Depends on** | STORY-03-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

All counter reads and the rolling pipeline update must target the primary. A counter read served by a lagging secondary produces a stale total and over-approves, which is the one failure direction this system must never have. Write concern is deliberately asymmetric between counters and the audit record.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | induced replication lag on secondaries | counter reads are issued | every read is served by the primary and no stale-read over-approval occurs |
| 2 | the counter path in any code path | the driver configuration is inspected | read preference is primary and this is asserted by an automated check rather than convention |
| 3 | a transaction being processed | writes are issued | counter increments use the faster write concern while the claim and status resolution use majority |
| 4 | reporting or reconciliation queries | they are executed | they may target secondaries and are never on the enforcement path |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC2/AC3 pass locally; AC1 (induced replication lag) cannot be exercised in this environment at all (see Notes)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/counterRepository.readWritePolicy.test.js`
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock) — the policy assertion is deliberately a unit test against a spy collection (AC2 asks for exactly this: "asserted by an automated check rather than convention"); every other integration test in this epic exercises the real options against real Mongo successfully, which is corroborating but not a dedicated test for this story
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — no metrics emitter yet (see EPIC-01/02 DoD notes); replication-lag alerting named in §4.6/§4.11 is not implemented
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Lag test | UAT 37 result under induced replication lag | **Not obtainable in this environment.** `docker-compose.yml` runs a single-node replica set (`rs0` with one member) specifically so `retryWrites`/pipeline updates work locally — there is no secondary to lag. A real multi-node replica set (staging or a dedicated multi-container compose profile) is required to induce lag and prove this AC; not yet provisioned | |
| Configuration assertion | Automated test failing if read preference drifts from primary | `tests/unit/counterRepository.readWritePolicy.test.js` — "AC2: every read explicitly requests primary read preference" (spies on the actual options object passed to the driver for every `CounterRepository` read method) and "AC3" (same for write concern) | |

## Notes / Risks

**AC1 is a genuine environment gap, not a skipped test.** What's provable and proven now: every counter repository method passes `PRIMARY_READ_OPTS`/`HOT_PATH_WRITE_OPTS` explicitly (`src/config/database.js`, reused unchanged from the EPIC-01 scaffold), asserted by a spy-based unit test rather than left to code-review convention. Proving that a secondary read *would* over-approve under real lag requires a multi-node replica set this local dev setup doesn't have — recorded here as an open item for a staging environment, consistent with how `docs/00-INDEX.md` already tracks RTO/RPO/DR topology as unresolved BRD inputs.

AC3's "claim and status resolution use majority [write concern]" half belongs to the `transactions` collection, which does not exist until EPIC-04. `MAJORITY_WRITE_OPTS` is already defined in `src/config/database.js` (from the EPIC-01 scaffold) ready for that story to use.
