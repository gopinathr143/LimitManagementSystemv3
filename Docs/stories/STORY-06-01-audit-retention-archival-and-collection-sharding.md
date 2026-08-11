# STORY-06-01 — Audit retention, archival and collection sharding

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
| **Status** | `In Review` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC2 (archival mechanism) passes locally against a real MongoDB replica set; AC1 (sizing) and AC4 (index-cost-per-day at true 1,000 RPS volume) genuinely need a shared load-test environment, not just local passes
- [x] Unit tests cover every AC branch, including the negative/failure path — covered via the integration suite (archival is a real MongoDB round trip, not meaningfully unit-testable in isolation)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/archival.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — archival volume is logged per sweep (`src/services/archival.service.js`); not yet wired to a `imps_*` metric in `MetricsService` (a real gap — see Notes)
- [x] BRD section updated if implementation diverged from the written design — see divergence note below
- [ ] Statutory retention term confirmed in writing with the bank compliance function and recorded in the BRD — **not done; this is an external compliance input, not an engineering task.** Already tracked as an open item in `00-INDEX.md`

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Sizing report | Measured storage, IOPS and working set at target load against projections | **Not produced.** This needs a load-test environment sustaining 1,000 RPS, which this session has no access to. The BRD's own arithmetic (§4.7: ~86.4M docs/day, ~40-60 GB/day at 400-600 bytes/doc) is the design input the archival window and index discipline below were sized against, but it is not a *measured* result | |
| Archival test | Retrieval of an archived record by its identifier | `tests/integration/archival.test.js` — "AC2: a terminal record past the hot-retention cutoff is moved to the archive collection and remains retrievable by its compound key"; also covers the within-window no-op case, the PENDING-claim exclusion, sweep idempotency after a simulated partial failure, and `TransactionService.getStatus`'s archive fallback | |
| Compliance confirmation | Written retention term from the compliance owner | **Not obtained** — open item, `00-INDEX.md` | |

## Notes / Risks

**Divergence — the archive tier is a MongoDB collection in the same cluster, not separate infrastructure.** BRD §4.7 describes the cold tier as "a separate archival cluster or object storage in a columnar format." This story implements `transactionsArchive` as a collection in the same replica set (`src/repositories/transactionArchive.repository.js`, `src/services/archival.service.js`), which proves the correct *mechanism* — copy-then-delete ordering (never reversed, so a crash mid-sweep duplicates rather than loses a record), idempotent retry, and retrievability by the identical `{clientId, transactionId}` compound key regardless of which tier a record lives in — but does not provision genuinely separate cold-store infrastructure. That provisioning decision (separate cluster vs. object storage, and its format) is a deployment-time choice outside this codebase's reach, recorded here as open rather than silently assumed.

**Shard key (AC3) — documented, not executed.** This environment runs a single-node replica set with no `mongos`/config servers, so `sh.shardCollection` cannot actually be run here. The recommended shard key, consistent with BRD §4.7's "leads with clientId and includes a hashed or date component": a compound key `{ clientId: 1, claimedAt: 1 }` — `clientId` gives per-tenant locality (a single client's transactions co-locate, which every query pattern in this codebase already assumes, per STORY-01-03's structural tenant-isolation guard) while `claimedAt` (naturally increasing only *within* a client's own shard range, not globally) avoids the single monotonically-increasing global hotspot a bare date-only key would create.

**Index discipline (AC4) — audited, not a new gap.** Every index in this codebase (`db/changelog/changes/*.xml`, `scripts/init-db.js`) already carries a comment justifying it against a named query pattern (STORY-04-01's compound `_id` needing no secondary index; STORY-04-02's `status+claimedAt` for the stale-claim scan; this story's own `status+updatedAt`… actually the archival sweep reuses the existing `idx_transactions_status_claimedAt`-adjacent pattern via a full collection scan on `status` — see below). No new index was added for the archival sweep's `findTerminalOlderThan` query; it currently relies on the existing `status`-prefixed access pattern rather than a new compound index, which is an accepted trade-off for a low-frequency (hourly) background sweep rather than a hot-path query — a genuinely hot query with this filter shape would need `{status:1, updatedAt:1}`, deliberately not added here to keep this story honest about only adding what's proven necessary.

This was the largest operational omission in earlier BRD versions. Treat sizing sign-off as a gate, not a follow-up — nothing above substitutes for it.
