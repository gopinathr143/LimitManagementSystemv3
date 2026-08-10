# EPIC-07 — Performance and Acceptance Certification

| Field | Value |
| :--- | :--- |
| **Status** | `Not Started` |
| **Stories** | 3 |
| **Total estimate (pts)** | 18 |
| **Completed** | 0 / 3 |

## Goal

Prove the system meets its stated throughput, latency and correctness guarantees under realistic load, and formally execute the BRD acceptance criteria.

## Definition of success

The 1000 RPS target and the sub-100ms internal budget are demonstrated rather than assumed, and every BRD acceptance case has a recorded pass.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-07-01](../stories/STORY-07-01-sustained-throughput-and-latency-certification.md) | Sustained throughput and latency certification | Must | 8 | `Not Started` |
| [STORY-07-02](../stories/STORY-07-02-hot-counter-concurrency-certification.md) | Hot counter concurrency certification | Must | 5 | `Not Started` |
| [STORY-07-03](../stories/STORY-07-03-formal-uat-execution-pack.md) | Formal UAT execution pack | Must | 5 | `Not Started` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
