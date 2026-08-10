# STORY-06-01 — Audit retention, archival and collection sharding

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.7 |
| **BRD UAT mapping** | None (operational) |
| **Depends on** | STORY-04-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

At 1000 RPS the transaction collection grows by roughly 86 million documents per day. Unmanaged, this collection alone determines the fate of the cluster, so the hot tier, archive tier and shard key must be decided before launch rather than after.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the transaction collection under sustained load | growth is measured | observed document and storage growth per day is within the projected sizing envelope |
| 2 | records older than the configured hot retention period | the archival process runs | they are moved to the cold store and remain retrievable by the compound client and transaction identifier |
| 3 | the transaction collection | its shard key is inspected | it leads with clientId and includes a hashed or date component so no monotonically increasing shard hotspot forms |
| 4 | any proposed additional index on the transaction collection | it is reviewed | it is justified against a named query pattern, since each index costs tens of millions of entries per day |
| 5 | the hot retention period | it is configured | it exceeds the longest consumer retry horizon and the settlement window required for reversal |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Statutory retention term confirmed in writing with the bank compliance function and recorded in the BRD

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Sizing report | Measured storage, IOPS and working set at target load against projections | | |
| Archival test | Retrieval of an archived record by its identifier | | |
| Compliance confirmation | Written retention term from the compliance owner | | |

## Notes / Risks

This was the largest operational omission in earlier BRD versions. Treat sizing sign-off as a gate, not a follow-up.
