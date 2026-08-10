# STORY-03-07 — Read preference and write concern policy

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `Not Started` |
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
| Lag test | UAT 37 result under induced replication lag | | |
| Configuration assertion | Automated test failing if read preference drifts from primary | | |

## Notes / Risks

_None recorded._
