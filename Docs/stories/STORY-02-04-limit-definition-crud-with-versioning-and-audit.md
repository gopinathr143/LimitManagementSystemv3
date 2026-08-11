# STORY-02-04 — Limit definition CRUD with versioning and audit

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.4, 2.3.3 |
| **BRD UAT mapping** | UAT 11, UAT 16, UAT 39 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Client-scoped CRUD for limit definitions, including scope overrides, effective dating, definition versioning and an immutable configuration audit trail. Thresholds are inclusive maxima and a mid-window change does not re-base already accumulated velocity.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | an existing limit definition | it is updated through the API | subsequent transactions are evaluated against the new threshold without a service restart |
| 2 | a scope override pinned to specific attribute values and a wildcard default for the same dimension | a transaction matches the pinned values | the scope override threshold takes precedence over the default |
| 3 | a threshold lowered below a customer already accumulated velocity | the next transaction in that window arrives | it is rejected, and the audit record names the new definition version in force |
| 4 | any create, update or delete on a definition | the write completes | an immutable audit entry records actor, timestamp, before and after values, and the new definition version |
| 5 | a definition with an effective-from date in the future | a transaction is evaluated before that date | the definition is not applied |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC2, AC4, AC5 pass fully locally; AC1 and AC3 pass at the configuration layer but their "subsequent transactions" half needs EPIC-04 (see Notes)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/limitDefinition.model.test.js`, `tests/unit/limitDefinition.service.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/limitDefinition.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — structured logs are in place; no metrics emitter yet (see STORY-02-01 DoD note)
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified
- [x] Amounts are stored and compared as integers in minor units with no floating point anywhere in the path — enforced in `validateLimitDefinitionCreate`/`validateLimitDefinitionUpdate` (`src/models/limitDefinition.model.js`); a float threshold is rejected, proven in both unit and integration tests

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| CRUD effect test | UAT 11 result showing changes take effect with no restart | `tests/integration/limitDefinition.test.js` — "AC1/AC4: PUT updates a threshold, is visible immediately..."; `tests/integration/configCache.integration.test.js` proves the in-process cache picks up the change via push-refresh, no restart. **"Subsequent transactions are evaluated against it" is not yet checkable** — there is no transaction endpoint until EPIC-04 | |
| Precedence test | UAT 16 result for scope override over wildcard default | `tests/unit/limitDefinition.model.test.js` and `tests/integration/limitDefinition.test.js` — "STORY-02-04 AC2: a scope override takes precedence over the wildcard default" | |
| Threshold change test | UAT 39 result including the recorded definition version | Partially: `tests/integration/limitDefinition.test.js` proves an update bumps `definitionVersion` and audits before/after. **The "already-consumed velocity, subsequent rejection" half needs counters (EPIC-03)** | |
| Audit sample | Configuration audit entry for one update | `tests/integration/limitDefinition.test.js` — asserts a `limitsAudit` entry with actor, before, after and `definitionVersion` | |

## Notes / Risks

**Scope note:** this story's CRUD, versioning, scope-precedence and audit-trail behaviour is fully implemented and tested. AC1 and AC3 each have a clause ("subsequent transactions are evaluated...", "the next transaction in that window is rejected...") that depends on the validation waterfall and counter engine from EPIC-03/EPIC-04, which are not part of this epic. What this story delivers is the exact configuration surface — `findApplicableDefinition` in `src/models/limitDefinition.model.js` — that waterfall will call.
