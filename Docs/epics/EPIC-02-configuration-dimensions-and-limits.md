# EPIC-02 — Configuration, Dimensions and Limits

| Field | Value |
| :--- | :--- |
| **Status** | `In Review` |
| **Stories** | 6 |
| **Total estimate (pts)** | 34 |
| **Completed** | 0 / 6 |

## Goal

Deliver the per-client registry and limit-definition management that let dimensions, windows and thresholds change under review without a code change.

## Definition of success

A reviewer can read one client's configuration and know exactly which dimension and window pairs are enforced and at what cost per transaction, and a product change to a threshold takes effect without a deployment.

## Stories

| ID | Title | Priority | Est. | Status |
| :--- | :--- | :--- | :--- | :--- |
| [STORY-02-01](../stories/STORY-02-01-per-client-dimension-registry-with-validated-snapshot-loading.md) | Per-client dimension registry with validated snapshot loading | Must | 8 | `In Review` |
| [STORY-02-02](../stories/STORY-02-02-per-dimension-window-declaration.md) | Per-dimension window declaration | Must | 5 | `In Progress` |
| [STORY-02-03](../stories/STORY-02-03-window-activation-timing-and-warming-state.md) | Window activation timing and warming state | Must | 5 | `In Progress` |
| [STORY-02-04](../stories/STORY-02-04-limit-definition-crud-with-versioning-and-audit.md) | Limit definition CRUD with versioning and audit | Must | 8 | `In Review` |
| [STORY-02-05](../stories/STORY-02-05-inert-definition-warnings-and-effective-flag.md) | Inert definition warnings and effective flag | Should | 3 | `In Review` |
| [STORY-02-06](../stories/STORY-02-06-in-process-definition-and-registry-cache-with-invalidation.md) | In-process definition and registry cache with invalidation | Must | 5 | `In Progress` |

## Epic exit criteria

- [ ] Every story above is `Done` with recorded completion evidence
- [ ] All BRD UAT cases mapped to this epic's stories have passed
- [ ] No `Blocked` or deferred story remains without a written, accepted decision
