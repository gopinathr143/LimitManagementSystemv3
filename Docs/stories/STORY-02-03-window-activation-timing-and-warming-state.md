# STORY-02-03 — Window activation timing and warming state

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `In Progress` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.3.2 |
| **BRD UAT mapping** | UAT 43 |
| **Depends on** | STORY-02-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Activating a window mid-period is fail-open, because a newly activated rolling or monthly counter starts from zero and under-counts until its window fills. Activation is therefore boundary-aligned by default, with an explicit warming opt-in that flags every affected decision in the audit.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a new monthly window declared mid-month | the registry is activated | the window is marked pending activation and is not enforced until the next month boundary in the client timezone |
| 2 | a new daily window declared mid-day | the registry is activated | it is not enforced until the next midnight in the client timezone |
| 3 | a window activated with the explicit warming opt-in | a transaction is evaluated | the window is enforced immediately and the audit record for that decision carries the warming state flag |
| 4 | a declared window that has passed its activation boundary | a transaction is evaluated | the window is enforced normally with no warming flag |
| 5 | a window being de-activated | the registry change is applied | enforcement stops immediately, since removing enforcement is safe in the fail-closed direction |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC1, AC2, AC3, AC4, AC5 pass locally at the registry/config layer; the "decision audit record carries the warming flag" half of AC3 needs EPIC-04's transaction audit trail, which doesn't exist yet (see Notes)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/registry.model.test.js` ("window activation timing" suite)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/registry.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — structured logs are in place; no metrics emitter yet (see STORY-02-01 DoD note)
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Activation timing test | UAT 43 result for pending activation and boundary crossing | `tests/unit/registry.model.test.js` — AC1/AC2 (new window PENDING_ACTIVATION until boundary), AC4 (state flips to ACTIVE once the boundary has passed, computed from `now` with no write required); `tests/integration/registry.test.js` — AC4 (API serves the derived `state`) | |
| Warming audit sample | Audit record showing the warming state flag on a decision | **Only the registry half exists.** `tests/unit/registry.model.test.js` — AC3 proves a `warming:true` window is enforced immediately and reports `state:"WARMING"` until its natural boundary. A per-transaction *decision* audit record carrying `windowState:"WARMING"` requires the `transactions` audit trail from EPIC-04, not yet built | |
| Risk sign-off | Written acceptance from the risk owner that boundary-aligned activation is the default | Not obtained — this is a business/compliance sign-off, not an engineering artifact. The implementation defaults to boundary-aligned (`PENDING_ACTIVATION`) and requires an explicit `warming:true` opt-in to bypass it, matching the BRD's stated default | |

## Notes / Risks

This is the highest-risk configuration behaviour in the epic. It is the one place where a config edit could silently relax enforcement.

**Scope note:** the activation-timing *computation* (boundary-aligned by default, explicit warming opt-in, state derived from `now` so a boundary crossing needs no write) is fully implemented and tested at the registry layer. What's deferred to EPIC-04 is wiring `windowState` into a real transaction's audit record — this story's engine-side contract (`deriveWindowState`, `isWindowEnforced` in `src/models/registry.model.js`) is what that future work will call.
