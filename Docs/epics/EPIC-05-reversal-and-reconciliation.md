# EPIC-05 — Reversal and Reconciliation

| Field | Value |
| :--- | :--- |
| **Status** | `In Review` |
| **Stories** | 2 |
| **Total estimate (pts)** | 16 |
| **Completed** | 0 / 2 |

## Goal

Reconcile this system's state with downstream IMPS outcomes, and provide the backstop that repairs counter drift when compensation itself fails.

## Definition of success

An approved transaction that fails downstream returns its consumed velocity to the customer, and no counter can stay permanently wrong without being detected.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-05-01](../stories/STORY-05-01-reversal-api-with-ordering-and-floor-guards.md) | Reversal API with ordering and floor guards | Must | 8 | `In Review` |
| [STORY-05-02](../stories/STORY-05-02-counter-reconciliation-sweeper.md) | Counter reconciliation sweeper | Must | 8 | `In Review` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
