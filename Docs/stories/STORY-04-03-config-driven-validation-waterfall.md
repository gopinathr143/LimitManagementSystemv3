# STORY-04-03 — Config-driven validation waterfall

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-04 — Transaction Validation and Idempotency](../epics/EPIC-04-transaction-validation-and-idempotency.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 8 |
| **BRD reference** | Section 2.4, 2.3 |
| **BRD UAT mapping** | UAT 6, UAT 7, UAT 14, UAT 18 |
| **Depends on** | STORY-02-02, STORY-03-03 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Iterate the client declared dimensions in registry order, evaluating only the windows each dimension declares, and reject on the first breach. A new dimension or window must become enforceable through configuration alone.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a dimension whose required attribute is absent from the transaction | the waterfall runs | that dimension is skipped as not applicable without error |
| 2 | a monthly limit breached while daily and per-transaction checks pass | a transaction is evaluated | it is rejected on the monthly window at that dimension |
| 3 | several dimensions each with configured limits | a transaction is evaluated | daily and monthly limits are enforced independently at each dimension |
| 4 | a new composite dimension added to the registry with a matching limit | the next transaction arrives | it is enforced with no code change and no deployment |
| 5 | a dimension with both amount and count thresholds | a transaction breaches only the count | it is rejected on count alone while the amount remains within range, and the reverse case also holds |
| 6 | the first breach in the waterfall | it is detected | evaluation stops immediately and no further dimension is checked |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — passing locally against a real MongoDB replica set; not yet run in a shared/CI environment
- [x] Unit tests cover every AC branch, including the negative/failure path — waterfall behaviour is proven via the integration suite below (it is inherently an orchestration over the real registry/definitions/counter engine, not meaningfully unit-testable in isolation); `tests/unit/transaction.service.test.js` covers the parts that do isolate cleanly (compensation/retry classification)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/transaction.waterfall.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — no metrics emitter yet (see EPIC-01/02/03 DoD notes); breach-by-dimension/window/metric counters named in §4.11 are a real gap once this runs under load
- [x] BRD section updated if implementation diverged from the written design — no divergence; implements §2.4's fixed evaluation order (Per-Txn → Daily Calendar → Daily Rolling → Monthly) exactly, including PER_TXN being generalised to every dimension per §2.3 rather than GLOBAL-only (see STORY-03-02's evidence, refactored here)

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Independence test | UAT 7 result across all configured dimensions | `tests/integration/transaction.waterfall.test.js` — "AC3: daily and monthly limits are enforced independently at different dimensions in the same transaction" | |
| Extensibility test | UAT 14 result adding a dimension with no code change | `tests/integration/transaction.waterfall.test.js` — "AC4: a new dimension declared in the registry is enforced immediately, with no code change" (a previously-nonexistent `UCIC_CHANNEL` composite dimension, enforced purely by registry config) | |
| Dual metric test | UAT 18 result for count-only and amount-only breaches | `tests/integration/transaction.waterfall.test.js` — "AC5: a dimension breaches on count alone while amount stays in range..." | |

## Notes / Risks

_None recorded._
