# STORY-03-01 — Counter key builder, document model and TTL cleanup

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-03 — Counter Engine](../epics/EPIC-03-counter-engine.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.2 |
| **BRD UAT mapping** | UAT 21 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Build counter document identifiers programmatically from the client registry, always leading with clientId, and rely on a TTL index for window cleanup so no application cleanup job is required.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a dimension with zero, one or several attributes | a counter key is built | the key is deterministic, leads with clientId, and concatenates attribute values in the order declared for that dimension |
| 2 | two clients with identical dimensions and identical attribute values | keys are built for both | the resulting keys differ and cannot collide |
| 3 | a calendar day or monthly counter whose window has passed | the TTL threshold elapses | the document is removed automatically with no application cleanup job running |
| 4 | a counter document being created | the write completes | clientId is present as a queryable field in addition to being embedded in the identifier |
| 5 | amounts written to a counter | values are stored | they are integers in minor units with no floating point representation |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set (docker-compose `rs0`); not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/counter.model.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration-slow/counterTtl.test.js` (real TTL expiry), plus every Tier1/Tier2/rolling integration test exercises the key builder and document model indirectly
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — no metrics emitter yet (see EPIC-01/02 DoD notes); this story has no rejection/decision path of its own to log
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified (direction segment intentionally omitted from the key format for now; deferred to EPIC-08 per `docs/00-INDEX.md`'s suggested delivery sequence)

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Key determinism test | Unit test output covering zero, single and composite attribute dimensions | `tests/unit/counter.model.test.js` — AC1 (composite), zero-attribute GLOBAL example, determinism-on-repeat | |
| TTL test | UAT 21 result showing automatic removal after window expiry | `tests/integration-slow/counterTtl.test.js` — a document with `expireAt` in the past is genuinely removed by MongoDB's own TTL monitor within ~90s (observed: ~16s), zero application cleanup code involved | |
| Collision test | Two-client key generation showing distinct keys | `tests/unit/counter.model.test.js` — AC2 | |

## Notes / Risks

`yarn test:integration:slow` is a separate script from `yarn test:integration` specifically for the TTL test — MongoDB's background TTL sweep runs on its own ~60s cadence, so this test genuinely waits on real infrastructure rather than asserting index metadata. Keeping it out of the default integration run avoids a 90s tax on every routine test invocation.
