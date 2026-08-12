# EPIC-08 — Direction Scoping and INWARD Readiness

| Field | Value |
| :--- | :--- |
| **Status** | `In Review` |
| **Stories** | 6 |
| **Total estimate (pts)** | 34 |
| **Completed** | 5 / 6 (STORY-08-04 `Blocked` — deliberate, accepted deferral; see its Notes) |

## Goal

Introduce transaction direction as a second scoping axis so that OUTWARD ships today and INWARD later becomes a configuration and attribute-extraction exercise rather than a re-keying migration.

## Definition of success

Direction is present in every counter key, transaction identity and audit record while only OUTWARD traffic exists, each direction carries its own dimension registry, and an inward policy can be authored and reviewed before inward traffic is switched on.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-08-01](../stories/STORY-08-01-direction-resolution-validation-and-fail-closed-gating.md) | Direction resolution validation and fail-closed gating | Must | 5 | `In Review` |
| [STORY-08-02](../stories/STORY-08-02-direction-segment-in-counter-keys-and-transaction-identity.md) | Direction segment in counter keys and transaction identity | Must | 8 | `In Review` |
| [STORY-08-03](../stories/STORY-08-03-per-direction-dimension-registry-with-backward-compatible-loading.md) | Per-direction dimension registry with backward compatible loading | Must | 8 | `In Review` |
| [STORY-08-04](../stories/STORY-08-04-combined-direction-scope-for-total-throughput-controls.md) | Combined direction scope for total throughput controls | Should | 5 | `Blocked` |
| [STORY-08-05](../stories/STORY-08-05-direction-scoped-configuration-apis-and-inert-inward-policy.md) | Direction-scoped configuration APIs and inert inward policy | Must | 5 | `In Review` |
| [STORY-08-06](../stories/STORY-08-06-inward-capacity-and-sizing-assessment.md) | INWARD capacity and sizing assessment | Must | 3 | `In Review` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence — none formally reach `Done` in this session (that requires a second engineer's review, which does not exist here); five of six reach `In Review` with every other Definition of Done item satisfied and evidenced, matching every prior epic's status ceiling in this backlog
- [x] All BRD UAT cases mapped to this epic's stories that are in scope have passed — UAT 45, 46, 49, 50, 51, 52 (STORY-08-01/02/03/05) all `PASS`, see `Docs/UAT-EXECUTION-PACK.md`. UAT 47/48 (STORY-08-04) remain `NOT YET IMPLEMENTED` — see the exit criterion below
- [x] No `Blocked` or deferred story remains without a written, accepted decision — STORY-08-04 is `Blocked` with its deferral rationale, scope boundary (only the `ALL` direction-segment constant reserved, no logic built) and re-activation trigger recorded in its own Notes / Risks section
