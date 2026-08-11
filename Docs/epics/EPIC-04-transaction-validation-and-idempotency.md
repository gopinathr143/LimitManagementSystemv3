# EPIC-04 — Transaction Validation and Idempotency

| Field | Value |
| :--- | :--- |
| **Status** | `In Review` |
| **Stories** | 6 |
| **Total estimate (pts)** | 39 |
| **Completed** | 0 / 6 |

## Goal

Deliver the request path: claim the transaction, run the config-driven waterfall across declared dimensions and windows, and compensate correctly on breach or failure.

## Definition of success

A duplicate or retried transaction can never double-count a counter, a breach is always a fast clean rejection, and every decision is explainable from its audit record.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-04-01](../stories/STORY-04-01-pending-claim-idempotency-mutex.md) | Pending claim idempotency mutex | Must | 8 | `In Review` |
| [STORY-04-02](../stories/STORY-04-02-stale-pending-claim-reaper.md) | Stale pending claim reaper | Must | 5 | `In Review` |
| [STORY-04-03](../stories/STORY-04-03-config-driven-validation-waterfall.md) | Config-driven validation waterfall | Must | 8 | `In Review` |
| [STORY-04-04](../stories/STORY-04-04-compensating-saga-with-correct-retry-classification.md) | Compensating saga with correct retry classification | Must | 8 | `In Review` |
| [STORY-04-05](../stories/STORY-04-05-audit-record-and-rejection-detail-capture.md) | Audit record and rejection detail capture | Must | 5 | `In Review` |
| [STORY-04-06](../stories/STORY-04-06-client-timezone-windows-and-clock-skew-control.md) | Client timezone windows and clock skew control | Must | 5 | `In Progress` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
