# STORY-08-03 — Per-direction dimension registry with backward compatible loading

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.3, 2.2 |
| **BRD UAT mapping** | UAT 46, UAT 52 |
| **Depends on** | STORY-02-01, STORY-08-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Restructure the client registry so dimensions are declared per direction, allowing each direction an entirely independent dimension set. A legacy configuration carrying a top-level dimension list normalises to an outward-only registry so the current client continues to work unchanged.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a client configuration declaring different dimension sets for each direction | transactions are processed | each direction evaluates only its own dimensions and neither errors on the other absence |
| 2 | the same dimension code declared in both directions with different windows and thresholds | transactions are processed | each direction enforces its own policy against its own counters |
| 3 | a legacy configuration with a top-level dimension list and no direction map | it is loaded | it normalises to an outward-only registry and existing outward enforcement is unchanged |
| 4 | a configuration change affecting one direction | it is applied | both directions are swapped in one atomic snapshot so their versions cannot diverge |
| 5 | a direction being enabled without a valid registry or without its mandatory global per-transaction limit | enablement is attempted | it is rejected, so no window exists in which traffic is accepted but ungoverned |

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
| Divergent set test | UAT 46 result for direction-specific dimensions | | |
| Migration test | UAT 52 result showing legacy config normalisation with unchanged behaviour | | |
| Enablement guard | Test showing a direction cannot be enabled with an invalid or incomplete registry | | |

## Notes / Risks

_None recorded._
