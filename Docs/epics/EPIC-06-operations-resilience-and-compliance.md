# EPIC-06 — Operations, Resilience and Compliance

| Field | Value |
| :--- | :--- |
| **Status** | `In Review` |
| **Stories** | 4 |
| **Total estimate (pts)** | 23 |
| **Completed** | 0 / 4 |

## Goal

Make the system operable and auditable at 1000 RPS, with the retention, protection and failure behaviour a financial risk gate requires.

## Definition of success

The service fails closed under every degraded condition, its data growth is planned rather than discovered, and an auditor can trace any historical decision.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-06-01](../stories/STORY-06-01-audit-retention-archival-and-collection-sharding.md) | Audit retention, archival and collection sharding | Must | 8 | `In Review` |
| [STORY-06-02](../stories/STORY-06-02-observability-and-alerting.md) | Observability and alerting | Must | 5 | `In Review` |
| [STORY-06-03](../stories/STORY-06-03-fail-closed-degradation-and-disaster-recovery-posture.md) | Fail-closed degradation and disaster recovery posture | Must | 5 | `In Review` |
| [STORY-06-04](../stories/STORY-06-04-data-protection-and-access-control.md) | Data protection and access control | Must | 5 | `In Review` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
