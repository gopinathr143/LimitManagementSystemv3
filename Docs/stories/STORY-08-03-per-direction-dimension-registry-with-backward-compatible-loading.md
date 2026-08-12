# STORY-08-03 — Per-direction dimension registry with backward compatible loading

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-08 — Direction Scoping and INWARD Readiness](../epics/EPIC-08-direction-scoping-and-inward-readiness.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 4.3, 2.2 |
| **BRD UAT mapping** | UAT 46, UAT 52 |
| **Depends on** | STORY-02-01, STORY-08-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Restructure the client registry so dimensions are declared per direction, allowing each direction an entirely independent dimension set. A legacy configuration carrying a top-level dimension list normalises to an outward-only registry so the current client continues to work unchanged.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a client configuration declaring different dimension sets for each direction | transactions are processed | each direction evaluates only its own dimensions and neither errors on the other absence |
| 2 | the same dimension code declared in both directions with different windows and thresholds | transactions are processed | each direction enforces its own policy against its own counters |
| 3 | a legacy configuration with a top-level dimension list and no direction map | it is loaded | it normalises to an outward-only registry and existing outward enforcement is unchanged |
| 4 | a configuration change affecting one direction | it is applied | both directions are swapped in one atomic snapshot so their versions cannot diverge |
| 5 | a direction being enabled without a valid registry or without its mandatory global per-transaction limit | enablement is attempted | it is rejected, so no window exists in which traffic is accepted but ungoverned |

## Definition of Done

- [x] All Acceptance Criteria below pass in a shared (non-local) environment — same real-MongoDB standard as every prior epic
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/registry.service.test.js`, `tests/unit/limitDefinition.service.test.js` (`DIRECTION_NOT_ENABLED` effectiveness branch)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/direction.test.js` "STORY-08-03" suite
- [ ] Code reviewed and approved by a second engineer — no second engineer exists in this session
- [x] Structured logs and metrics emitted per Section 4.11 of the BRD — registry/limit writes already logged with `clientId`/`direction` context per the existing STORY-02-01/02-04 logging
- [x] BRD section updated if implementation diverged from the written design — no divergence

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Divergent set test | UAT 46 result for direction-specific dimensions | `tests/integration/direction.test.js` AC1/AC2 — a dimension present only in OUTWARD's registry never breaches (or even loads) for an INWARD transaction, and an identical dimensionCode in both directions enforces its own independent threshold | |
| Migration test | UAT 52 result showing legacy config normalisation with unchanged behaviour | `tests/integration/direction.test.js` AC3 — a hand-inserted pre-EPIC-08 document (top-level `allowedDimensions`, no `directions` map) is loaded, enforces OUTWARD exactly as before, and is left byte-for-byte unmodified on disk (`normalizeRegistryDoc` normalises at the read boundary only, in `RegistryRepository.findByClientId`) | |
| Enablement guard | Test showing a direction cannot be enabled with an invalid or incomplete registry | `tests/integration/direction.test.js` AC5 — `PATCH /clients/:clientId/directions` rejects with `DIRECTION_REGISTRY_INCOMPLETE` before any registry exists for the direction, then `DIRECTION_GLOBAL_PER_TXN_MISSING` once the registry exists but no mandatory Global Per-Transaction limit does, then succeeds once both are in place | |

## Notes / Risks

**AC4 (atomic single-doc swap)** is a structural property rather than a directly-observable-through-the-API one: `RegistryService.replaceRegistry` always reads the full multi-direction document, merges only the one direction being replaced into a fresh `directions` object, and writes it back with a single `replaceOne` — there is no code path that updates one direction's sub-document in place. `tests/integration/registry.test.js` "AC1/AC5: two clients enforce only their own registry, independently" and the pre-existing `configVersion` monotonicity tests cover the single-document-per-client invariant this relies on; STORY-08-03's own new tests (AC1/AC2) additionally prove that replacing one direction never disturbs the other direction's already-loaded snapshot.
