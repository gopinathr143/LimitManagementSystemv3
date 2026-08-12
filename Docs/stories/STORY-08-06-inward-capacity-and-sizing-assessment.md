# STORY-08-06 — INWARD capacity and sizing assessment

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 3 |
| **BRD reference** | Section 4.5, 4.1, 4.7 |
| **BRD UAT mapping** | None (planning) |
| **Depends on** | STORY-08-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Enabling inward adds an independent counter set and an independent claim and audit write stream. Capacity is additive rather than free, so the throughput target must be restated and the storage projections revisited before inward is switched on.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the stated throughput target | inward enablement is planned | the target is restated explicitly as either per direction or combined and recorded in the specification |
| 2 | audit storage projections | inward volume is added | revised daily document and storage growth figures are produced and reviewed against the retention design |
| 3 | hot dimensions in each direction | sizing is reviewed | shard factors are set per direction from that direction measured rate rather than copied from outward |
| 4 | the sizing assessment | it is completed | infrastructure sign-off is recorded before inward traffic is accepted |

## Definition of Done

- [x] All Acceptance Criteria below pass in a shared (non-local) environment — this is a documentation-only story (no code, per its own scope); "passing" means the written assessment below exists and is internally consistent with the implemented design, which it is. AC4 (infrastructure sign-off) is explicitly **not** met — see below
- [x] Unit tests cover every AC branch, including the negative/failure path — not applicable; there is no code to unit test in this story (matches STORY-07-01/07-03's precedent for planning/certification-only stories)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — not applicable, same reasoning
- [ ] Code reviewed and approved by a second engineer — no second engineer exists in this session
- [x] Structured logs and metrics emitted per Section 4.11 of the BRD — not applicable (no code); the per-tier metrics this sizing work depends on (`imps_counter_tier_duration_seconds`, retry/exhaustion counters) already exist from STORY-06-02 and are what a real capacity exercise would read
- [x] BRD section updated if implementation diverged from the written design — no divergence; this restates and extends BRD §4.5/§4.7's own figures for the two-direction case

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Restated target | Written throughput target with the per-direction or combined basis stated | See "Restated throughput target" below — recorded as a still-open business/infrastructure decision (BRD §4.5's own words: "an open item to confirm before inward sizing"), with both interpretations' consequences spelled out so the decision-maker can choose with full information | |
| Revised sizing | Updated storage and IOPS projections including inward | See "Revised storage projections" below — extends BRD §4.7's single-direction figures (86.4M docs/day, 40-60 GB/day at 1,000 RPS) to the two-direction case under both interpretations | |
| Sign-off | Infrastructure acceptance recorded | **Not obtained — no infrastructure function exists in this session.** Recorded honestly as an open item below, per this project's standing practice (STORY-06-01/06-03/07-01 all record the same class of gap rather than fabricate a sign-off) | |

## Notes / Risks

### Restated throughput target (AC1)

BRD §4.5 states the target must be restated at INWARD enablement as either **per-direction** or **combined**, and names this an open item (§5, §4.5 line "an open item to confirm before inward sizing"). This session has no business or infrastructure stakeholder to make that call, so both interpretations are recorded here with their distinct consequences — the decision itself remains open, tracked in `00-INDEX.md`'s open items table against this story.

- **Per-direction interpretation:** OUTWARD sustains 1,000 RPS and INWARD *independently* sustains up to 1,000 RPS — worst case 2,000 RPS combined write load on the cluster. Every `hot` dimension is sized per direction from that direction's own measured rate (BRD §4.3/§4.5) — a `PER_DIRECTION` hot dimension is "hot twice," each instance sized independently. This is the more conservative (safer) reading and is what this codebase's implementation already assumes structurally: `enabledDirections`, per-direction registries and independently-shardable dimensions all support two directions running at their own rates with no shared ceiling.
- **Combined interpretation:** the two directions *share* a 1,000 RPS ceiling (e.g. 600 OUTWARD + 400 INWARD at some instant). Total write load never exceeds today's single-direction figure, but a `COMBINED` dimension's counter (STORY-08-04, not built — see that story's notes) would need to absorb the full combined rate on one logical counter, which is exactly the sizing concern STORY-08-04 raises and defers.
- **Recommendation, not a decision:** given STORY-08-04 is deliberately deferred and no combined-counter code path exists yet, this codebase is only actually exercised under the **per-direction** interpretation today. If the combined interpretation is later confirmed as the real target, STORY-08-04 becomes load-bearing (not merely "should") and must be built before INWARD sees material traffic under a shared ceiling.

### Revised storage projections (AC2)

BRD §4.7 projects, for OUTWARD alone at 1,000 RPS: ~86.4 million `transactions` documents/day (~2.6 billion/month), 400-600 bytes/document plus indexes, **~40-60 GB/day**. Extending this to two directions:

- **Per-direction interpretation (each direction up to 1,000 RPS independently):** worst case **doubles** the single-direction figures — up to ~172.8 million documents/day, ~80-120 GB/day, across the `transactions` collection alone. The `direction` field on every document (this epic's schema change) adds a small, fixed per-document cost already reflected in the 400-600 byte estimate; it does not change the growth *shape*, only who is writing.
- **Combined interpretation (shared 1,000 RPS ceiling):** total volume is unchanged from BRD §4.7's original figures (~86.4M docs/day, ~40-60 GB/day) — the same total requests, now split by `direction` rather than assumed all-OUTWARD.
- **Counters collection:** grows independently per direction regardless of interpretation, since every direction's registry produces its own counter documents (the direction segment sits in every counter key — STORY-08-02). A client with symmetric OUTWARD/INWARD registries roughly **doubles** its steady-state counter document count versus OUTWARD-only, bounded by TTL exactly as today (STORY-03-01).
- **Archive tier (STORY-06-01):** the same retention-term open item applies unchanged; two directions' worth of terminal records flow into the same archival sweep, so the archival cadence and cold-storage sizing scale with whichever of the two projections above turns out to be real.
- These are extrapolations of BRD §4.7's own stated methodology, not independently measured figures — this session has no production-representative environment to measure real INWARD volume against (same honesty caveat as STORY-07-01/07-02's throughput/concurrency certifications).

### Per-direction shard factor guidance (AC3)

The implementation already enforces the structural half of this requirement: `directions.{OUTWARD,INWARD}.allowedDimensions[].shardFactor` are independent fields in the registry document (STORY-08-03), so a `hot` dimension's `shardFactor` for OUTWARD and INWARD can never accidentally share one value — there is no code path that copies one direction's setting into the other. What remains a genuine open item, because it needs real measured traffic this session does not have: **the actual `shardFactor` value for INWARD's hot dimensions must come from INWARD's own measured peak rate** (BRD §4.2's rule of thumb, `shardFactor ≥ ceil(clientPeakLogicalWriteRate / ~50)`), not copied from OUTWARD's tuned value — the two directions' traffic shapes (e.g. inward credit bursts around salary/settlement cycles vs. steadier outward debit traffic) have no reason to match. `tests/integration-slow/hotCounterCertification.test.js`'s methodology (drive real concurrent load, measure shard-spread and overshoot, compare shard factors empirically) is the mechanism to re-run per direction once real INWARD traffic exists.

### Sign-off (AC4)

**Not recorded — no infrastructure function exists in this session to grant it.** This is an explicit, honest gap rather than a fabricated pass, consistent with every other infrastructure-dependent open item in this backlog (MongoDB version confirmation, DR topology, encryption-key management). The above sections are what such a sign-off review would need as input.
