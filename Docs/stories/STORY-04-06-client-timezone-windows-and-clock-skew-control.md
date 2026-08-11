# STORY-04-06 — Client timezone windows and clock skew control

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
| **Status** | `In Progress` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.8 |
| **BRD UAT mapping** | UAT 40 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Window boundaries are computed in the client configured timezone rather than the server timezone, with storage remaining in UTC. Instance clock skew splits writes across adjacent buckets at a boundary, so skew must be bounded and monitored.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a client configured in a timezone other than the server timezone | a calendar day or monthly window is evaluated | the window resets at midnight in the client timezone |
| 2 | two clients in different timezones | both are processed | each observes its own reset boundaries independently |
| 3 | an instance whose clock skew exceeds the configured tolerance | the condition is detected | an alert is raised and the instance is drained from the pool |
| 4 | all instances running within the skew tolerance | a window boundary is crossed | bucket assignment is consistent across instances |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC1/AC2/AC4 pass locally against a real MongoDB replica set; AC3 (skew detection + drain) is implemented as an application-level policy hook only, not a full NTP measurement pipeline (see divergence note below)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/clockSkew.service.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/transaction.audit.test.js` ("Client timezone windows" suite)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — skew-exceeded events are logged at error level (`src/services/clockSkew.service.js`); not yet wired to a metrics emitter or an actual instance-drain action (see EPIC-01/02/03 DoD notes)
- [x] BRD section updated if implementation diverged from the written design — see divergence note below

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Timezone test | UAT 40 result for a non-server timezone client | `tests/integration/transaction.audit.test.js` — "AC1/AC2: two clients in different timezones each get their own calendar-day counter bucket" (Asia/Kolkata vs America/Los_Angeles at the identical UTC instant, verified to land in different calendar-day buckets — Kolkata already rolled over, Los Angeles had not). This mechanism (`src/utils/windowBoundary.js`) is the same one exercised throughout EPIC-02/03; this test proves it end-to-end through the real transaction path | |
| Skew monitoring | Alert configuration and a test firing showing detection | `tests/unit/clockSkew.service.test.js` — skew beyond the configured ±1s tolerance logs an alert and flips `isHealthy()` false; recovers once back in tolerance | |

## Notes / Risks

**Divergence, recorded per this story's own DoD:** AC3 ("an instance whose clock skew exceeds tolerance is detected... an alert is raised and the instance is drained") is implemented as a **policy decision only** (`src/services/clockSkew.service.js`'s `ClockSkewMonitor`: given a measured skew, decide healthy/unhealthy and log). Actually *measuring* skew against a trusted time source (BRD §4.8: "All instances MUST run NTP") is treated as an OS/infrastructure concern — an NTP daemon (chronyd/ntpd) reports drift as a system metric; implementing an NTP client inside this Node service would mean parsing untrusted third-party protocol responses for a control this system doesn't own the enforcement of, which is disproportionate scope for this story. "Draining the instance" is similarly an orchestration/process-supervisor action (e.g. a Kubernetes readiness probe reading `isHealthy()`), not something this service can do to itself. What's implemented is the seam: `ClockSkewMonitor.check(referenceTime, now)` accepts a skew reading from wherever it's actually measured and applies BRD §4.8's ±1s policy consistently.
