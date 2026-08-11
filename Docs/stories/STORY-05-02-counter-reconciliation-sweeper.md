# STORY-05-02 — Counter reconciliation sweeper

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-05 — Reversal and Reconciliation](../epics/EPIC-05-reversal-and-reconciliation.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 3.5 |
| **BRD UAT mapping** | UAT 36 |
| **Depends on** | STORY-05-01, STORY-04-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Compensation can itself fail, and a crashed request can leave increments nobody compensated, leaving a counter permanently inflated and silently over-rejecting real customers. Because the transaction collection records every applied counter key, counters are derivable and therefore repairable.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | injected counter drift from a failed compensation | the sweeper runs | the drift is detected, alerted, and the closed-window counter is corrected to the value derived from the transaction records |
| 2 | a failed decrement floor guard, a failed compensation or an abandoned claim | any of these occur | the affected key is queued for targeted reconciliation rather than waiting for the periodic sweep |
| 3 | an open window with drift | the sweeper runs | the drift is alerted first and auto-correction is applied only where policy permits, since silently rewriting a live risk counter is itself a risk |
| 4 | a sharded hot counter operating within its documented overshoot bound | the sweeper runs | no drift alert is raised, because the tolerance is set above the accepted bound |
| 5 | a closed window | the nightly pass runs | all counters for that window are verified against derived values |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — covered via the integration suite (drift detection is inherently a comparison between the real `transactions` and `counters` collections, not meaningfully unit-testable against fakes without just re-testing the fakes' own arithmetic)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/reconciliation.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — drift detection/correction and rolling-tier alerts are logged at error/warn level (`src/services/reconciliation.service.js`); §4.11's "counter drift" as an aggregated, dashboarded metric is not yet wired to a metrics emitter (see EPIC-01–04 DoD notes — an existing, carried-forward gap)
- [x] BRD section updated if implementation diverged from the written design — two scope notes recorded below (rolling-window reconciliation, tolerance policy)

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Drift repair test | UAT 36 result showing detection, alert and correction | `tests/integration/reconciliation.test.js` — "AC1/UAT 36: injected drift on a closed window is detected, alerted and corrected to the value derived from transactions" | |
| False positive check | Result showing normal Tier 2 operation generates no drift noise | `tests/integration/reconciliation.test.js` — "AC4/AC5: a closed-window full pass verifies every counter and raises no drift for normal, undisturbed operation" (includes a sharded GLOBAL/tier2 counter) | |
| Runbook | Documented operator procedure for responding to a drift alert | See Notes below — recorded here rather than a separate ops document, since there is no `docs/runbooks/` yet in this repo | |

## Notes / Risks

**Scope note — why physical drift is exactly zero under normal operation, including for Tier 2.** BRD §3.5's "Note on Tier 2" anticipates needing a reconciliation tolerance above Tier 2's accepted overshoot bound so normal sharded operation doesn't generate alert noise. Investigating this while implementing turned up why that concern doesn't actually require a nonzero tolerance here: Tier 2's bounded overshoot (STORY-03-04) is a *soft-enforcement* phenomenon — concurrent requests can collectively approve more than the configured threshold because the cached read is stale — but every approval, overshoot or not, still writes its exact delta to the physical counter document AND records that same delta in `appliedCounterKeys` in the same request. The two numbers can only ever disagree if a request crashes between those two writes (exactly the failure modes this sweeper targets: a lost compensation, a lost reversal decrement, an abandoned claim). So the drift comparison in `#reconcileOne` uses exact equality (tolerance = 0) for both tiers, and AC4's test proves it: a sharded, hot GLOBAL counter under normal operation shows zero drift. `autoCorrectOpenWindows` remains a policy knob (default `false`) for the open/closed-window question BRD §3.5 AC3 raises, which is a different axis from tolerance.

**Scope note — DAILY_ROLLING counters are never auto-corrected, targeted or general.** A rolling window has no "closed" state (BRD §4.2.5: a continuous 24h sliding horizon), so the BRD's own closed-window auto-correct trigger structurally does not apply to it. `ReconciliationService` treats any `tier: 'rolling'`/`'rolling-sharded'` signal as alert-only unconditionally — see `#alertRollingDrift`. Rolling counters can still be *detected* as drifted by an operator reading the alert; automated repair for them is left for a future story if it proves necessary in practice, since reconciling a per-bucket rolling document correctly would need bucket-level (not whole-document) derivation and correction, materially more complex than the flat-counter case this story covers.

**Runbook (drift alert response):** a `Counter drift detected` error log names `clientId`, `counterKey`, `actual`, `expected`, and the drift amounts. 1) If the log is followed by `Counter drift corrected` (closed window, auto-corrected), no action is needed beyond confirming the correction landed (`counters` collection, that `_id`, `reconciledAt` set). 2) If the outcome was `ALERTED` (open window, or a rolling counter), an operator should inspect `reconciliationQueue` for the matching `counterKey` to see whether it was a targeted signal (a specific known failure) or came from the periodic sweep, then decide whether to wait for the window to close (auto-correct will apply then) or correct manually via `CounterRepository.correctCounterValue`. 3) A recurring drift source (the same `dimensionCode`/tier repeatedly) is a signal to investigate the underlying floor-guard failures, not just keep correcting the symptom.
