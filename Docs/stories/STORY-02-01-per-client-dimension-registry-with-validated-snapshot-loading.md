# STORY-02-01 — Per-client dimension registry with validated snapshot loading

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.3 |
| **BRD UAT mapping** | UAT 25 |
| **Depends on** | STORY-01-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Implement the per-client allowed-dimensions registry as an immutable, versioned snapshot, loaded and atomically swapped in-process per client. Validation must reject a structurally invalid configuration rather than allowing it to silently alter enforcement.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | two clients with different registries | each submits traffic | each client enforces only the dimensions declared in its own registry |
| 2 | a registry missing the GLOBAL dimension | it is submitted for that client | validation rejects it and the previously loaded snapshot stays in force |
| 3 | a registry declaring an attribute the engine cannot extract | it is submitted | validation rejects it and names the offending dimension and attribute |
| 4 | a valid new registry version | it is activated | the in-process snapshot is swapped atomically and no in-flight request sees a partially applied configuration |
| 5 | client A registry is changed | client B traffic continues | client B loaded snapshot is unaffected |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Snapshot objects are immutable after load, enforced by type or test

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Per-client enforcement | UAT 25 result showing two clients with divergent registries | | |
| Validation matrix | Test output covering each rejection rule | | |
| Atomic swap proof | Concurrency test showing no request observes a mixed-version snapshot | | |

## Notes / Risks

_None recorded._
