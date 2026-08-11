# EPIC-03 — Counter Engine

| Field | Value |
| :--- | :--- |
| **Status** | `In Review` |
| **Stories** | 7 |
| **Total estimate (pts)** | 45 |
| **Completed** | 0 / 7 |

## Goal

Implement the MongoDB-only velocity counter store that sustains 1000 RPS including a single logical counter incremented up to 1000 times per second, with the strictness each tier promises.

## Definition of success

Every counter tier behaves exactly as Section 5 of the BRD claims: Tier 0 exact, Tier 1 and the per-entity rolling window strict and race-free, Tier 2 approximate within a bounded and measured overshoot.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-03-01](../stories/STORY-03-01-counter-key-builder-document-model-and-ttl-cleanup.md) | Counter key builder, document model and TTL cleanup | Must | 5 | `In Review` |
| [STORY-03-02](../stories/STORY-03-02-tier-0-stateless-per-transaction-check.md) | Tier 0 stateless per-transaction check | Must | 3 | `In Review` |
| [STORY-03-03](../stories/STORY-03-03-tier-1-bootstrap-plus-guarded-conditional-increment.md) | Tier 1 bootstrap plus guarded conditional increment | Must | 8 | `In Review` |
| [STORY-03-04](../stories/STORY-03-04-tier-2-sharded-counters-with-cached-totals.md) | Tier 2 sharded counters with cached totals | Must | 8 | `In Review` |
| [STORY-03-05](../stories/STORY-03-05-safe-shard-factor-change-semantics.md) | Safe shard factor change semantics | Must | 5 | `In Review` |
| [STORY-03-06](../stories/STORY-03-06-rolling-window-as-a-single-document-with-pipeline-update.md) | Rolling window as a single document with pipeline update | Must | 13 | `In Review` |
| [STORY-03-07](../stories/STORY-03-07-read-preference-and-write-concern-policy.md) | Read preference and write concern policy | Must | 3 | `In Progress` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
