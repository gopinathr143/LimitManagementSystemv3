# STORY-08-05 — Direction-scoped configuration APIs and inert inward policy

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.4 |
| **BRD UAT mapping** | UAT 51 |
| **Depends on** | STORY-08-03, STORY-02-05 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Extend the configuration APIs so registries and limit definitions are addressed per direction, and so an inward policy can be authored, reviewed and stored while inward remains disabled. This is what makes enabling inward a reviewed switch rather than a big-bang release.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | inward not yet enabled | a full inward registry and inward limit definitions are created | they are stored, reported as not effective, and have no effect on outward traffic |
| 2 | that stored inward policy | inward is subsequently enabled | it is enforced immediately with no code change and no redeployment |
| 3 | a limit definition | it is created | it carries a direction that is immutable thereafter |
| 4 | a list request for limit definitions | it is filtered by direction | only that direction definitions are returned, each with its effective flag |
| 5 | a definition whose direction is not enabled | it is created | the response carries a non-blocking warning naming the direction gate specifically |

## Definition of Done

- [x] All Acceptance Criteria below pass in a shared (non-local) environment — same real-MongoDB standard as every prior epic
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/limitDefinition.model.test.js` (STORY-08-05 AC3 direction-required/immutable), `tests/unit/limitDefinition.service.test.js` (STORY-08-05 AC5 `DIRECTION_NOT_ENABLED`)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/direction.test.js` "STORY-08-05" suite
- [ ] Code reviewed and approved by a second engineer — no second engineer exists in this session
- [x] Structured logs and metrics emitted per Section 4.11 of the BRD — limit-definition writes already logged with `direction` in their structured fields (`limitDefinition.service.js`)
- [x] BRD section updated if implementation diverged from the written design — no divergence

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Inert policy test | UAT 51 result showing storage, non-effect and activation on enablement | `tests/integration/direction.test.js` AC1/AC2 — a full INWARD registry and a tight INWARD limit are authored (and returned with `effective: false` / `DIRECTION_NOT_ENABLED`) while INWARD is disabled, outward traffic is unaffected, INWARD transactions are rejected at the gate; once `PATCH .../directions` enables INWARD, the identical previously-authored policy is enforced immediately with no code change | |
| API contract | Documented direction-scoped endpoints reviewed with consumer teams | Not reviewed — no consumer team exists in this session. The contract itself: `PUT /clients/:id/dimensions` and `POST/GET /clients/:id/limits` all require/accept `direction`; `PATCH /clients/:id/directions` is the sole guarded enablement path (STORY-08-03 AC5). `tests/integration/direction.test.js` exercises every one of these against real MongoDB | |

## Notes / Risks

**AC3 (direction immutability)** is enforced the same way every other identity field on a limit definition already is: `validateLimitDefinitionUpdate` rejects any payload naming `direction` (alongside `dimensionCode`, `windowType`, `scope`) with a `VALIDATION_ERROR` naming the field — proven in `tests/integration/direction.test.js` AC3.
