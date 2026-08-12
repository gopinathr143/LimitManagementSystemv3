# STORY-08-04 — Combined direction scope for total throughput controls

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `Blocked` |
| **Priority** | Should |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 2.1.7, 4.2 |
| **BRD UAT mapping** | UAT 47, UAT 48 |
| **Depends on** | STORY-08-03 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Support a dimension declared as combined, whose counter is shared across both directions under a direction-neutral key segment. This expresses a total-throughput control that neither direction can enforce alone, such as a cap on total account turnover regardless of whether funds are arriving or leaving.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a combined dimension declared identically in both directions | outward and inward transactions are processed | both increment the same shared counter and the combined total triggers rejection in either direction |
| 2 | a reversal of a transaction that incremented a combined counter | reversal is called | the shared key is decremented correctly and the combined total reduces |
| 3 | a combined dimension declared with different attributes or windows across the two directions | the configuration is submitted | registry validation rejects it and the previously loaded snapshot stays in force |
| 4 | a hot combined dimension | sharding is sized | the shard factor is sized against the sum of both directions rates rather than either alone |
| 5 | a combined counter key | it is inspected | the direction segment carries the shared neutral value rather than a specific direction |

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
| Shared counter test | UAT 47 result showing both directions incrementing one total | | |
| Asymmetry rejection | UAT 48 result for mismatched combined declarations | | |
| Sizing rationale | Recorded shard factor justification against combined rate | | |

## Notes / Risks

Confirm with the risk function whether any combined control is actually required before building this. It is genuinely useful for mule-account throughput detection but adds a counter that is hot from both directions at once.

**Deliberately not built in this session — a written, accepted decision, not an oversight.** This story's own text (above) makes building it conditional on a confirmation from the risk function that does not exist in this session. Rather than guess at a scope that has real production consequences (a counter hot from both directions simultaneously, at whatever combined rate that implies for sharding), the decision made here is to:

- Reserve the wire format only: `COMBINED_DIRECTION_SEGMENT = 'ALL'` is defined in `src/constants/index.js` as the direction-segment value a combined counter key would use, so a future implementation slots into the existing key format (`limit:{clientId}:{direction|ALL}:{dimensionCode}:...`) without a migration.
- Build nothing else — no registry validation for symmetric combined declarations (AC3), no shared-counter increment/decrement path (AC1/AC2), no combined shard sizing (AC4/AC5).
- Leave UAT 47 and UAT 48 recorded as `NOT YET IMPLEMENTED` in `Docs/UAT-EXECUTION-PACK.md` rather than fabricating a pass.

This keeps the epic's other five stories shippable on schedule (STORY-08-01/02/03/05/06 are all `Must` priority and have no dependency on this `Should`-priority story) while leaving the door open. Per `00-INDEX.md`'s open items table, "whether any combined total-throughput control is required" remains an open item owned by Risk.
