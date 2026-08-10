# STORY-04-05 — Audit record and rejection detail capture

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 3.2 |
| **BRD UAT mapping** | UAT 2 |
| **Depends on** | STORY-04-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Every request is persisted with enough detail to explain the decision later, including which dimension and window breached, which metric, the threshold and definition version in force, current velocity, and the exact counter keys and shard buckets applied.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a rejected transaction | the audit record is written | it names the breached dimension, window, metric, threshold, definition version, and both current amount and count |
| 2 | an approved transaction | the audit record is written | it lists every applied counter key with its dimension, window, resolved attribute values, shard bucket and shard factor in force |
| 3 | any transaction | its record is inspected | it carries the clientId and can be retrieved by the compound client and transaction identifier |
| 4 | a decision taken while a window is warming | the record is written | it carries the warming state flag |

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
| Audit completeness | UAT 2 result validating every required rejection field | | |
| Reversal support | Confirmation that recorded keys are sufficient to reverse without re-deriving them | | |

## Notes / Risks

_None recorded._
