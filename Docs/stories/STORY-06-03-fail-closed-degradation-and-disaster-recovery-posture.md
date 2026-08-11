# STORY-06-03 — Fail-closed degradation and disaster recovery posture

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.9 |
| **BRD UAT mapping** | UAT 38 |
| **Depends on** | STORY-03-07 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

A velocity gate that fails open is worse than one that is down. Every degraded or ambiguous state must reject rather than allow, and there is deliberately no bypass toggle.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | MongoDB unreachable | transactions are submitted | they are rejected and never allowed through |
| 2 | an unresolvable configuration snapshot or a missing mandatory Global per-transaction limit | a transaction arrives | the service fails closed |
| 3 | the datastore recovering after an outage | traffic resumes | normal enforcement is restored with no manual counter repair required beyond reconciliation |
| 4 | the codebase | it is reviewed | no allow-through or bypass mode exists in any configuration path |
| 5 | a primary step-down during load | failover occurs | the driver retries writes across the step-down and any lost increments are repaired by reconciliation |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC1/AC2/AC4/AC5 pass locally against a real induced-unavailability test and code audit; AC3 (recovery after real outage) and formal RTO/RPO confirmation need a shared environment and business input this session doesn't have
- [x] Unit tests cover every AC branch, including the negative/failure path — this story is almost entirely a real-infrastructure-behavior proof, not meaningfully unit-testable in isolation (see integration tests below)
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/failClosed.test.js` (a deliberately *unreachable* MongoDB target — the point of this story)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — every failure path already logs at error level (unhandled datastore errors go through `errorHandler`'s catch-all, `src/middleware/errorHandler.js`); no dedicated "fail-closed event" metric exists yet, a reasonable follow-up if this path needs its own dashboard signal distinct from the generic error-rate metric (STORY-06-02)
- [x] BRD section updated if implementation diverged from the written design — no divergence; this story mostly verifies and documents behavior that emerged as a structural property of EPIC-01 through EPIC-05's design, rather than adding new mechanism

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Fail-closed test | UAT 38 result under induced datastore unavailability | `tests/integration/failClosed.test.js` — "AC1/UAT 38: submitting a transaction while MongoDB is unreachable never returns an APPROVED (or any success) response" (a real `MongoClient` pointed at an unused local port, full HTTP round trip via `supertest`) and "AC2: an unresolvable configuration snapshot... fails closed the same way" | |
| Failover test | Result showing recovery and reconciliation after a step-down | **Not run.** A real primary step-down needs a multi-node replica set (this environment runs single-node) to actually trigger; what IS confirmed is the driver-level precondition BRD §4.9 AC5 requires — `retryWrites: true` is configured (`src/config/database.js`) and any increment lost to a failover is repaired by the already-tested reconciliation sweeper (EPIC-05) — but no test here induces a real step-down | |
| Recovery objectives | Confirmed targets and topology recorded in the BRD | **Not obtained** — RTO/RPO and DR topology are a business/infrastructure decision, already tracked as an open item in `00-INDEX.md` ("Recovery time and recovery point objectives, and DR topology | STORY-06-03 | Infrastructure") | |

## Notes / Risks

**This story is mostly a verification, not new mechanism.** Fail-closed behavior (AC1, AC2, AC4) is a structural consequence of decisions already made in earlier epics, re-confirmed here rather than newly built:
- Every service method that can fail (a Mongo error, an unresolvable config snapshot) throws rather than returning a default/allow value; `TransactionService.submit()` has no catch-and-approve path anywhere.
- `errorHandler` (`src/middleware/errorHandler.js`) converts any uncaught error, `AppError` or not, into `{success:false, ...}` with a 4xx/5xx status — there is no code path that turns a thrown error into a 200 response.
- A code audit (`grep -rniE "bypass|skipvalidation|allowthrough|force.?approve|debug.?mode|test.?mode" src/`) found no allow-through or bypass flag anywhere in the codebase (AC4), and `tests/integration/failClosed.test.js`'s third test asserts this structurally by inspecting `TransactionService`'s own source text, not just grepping strings that could be renamed around.
- `retryWrites: true` (AC5) has been configured in `src/config/database.js` since EPIC-01's scaffold.

**AC3 (recovery with no manual repair beyond reconciliation)** is the one AC this story doesn't independently re-prove: EPIC-05's reconciliation sweeper (`ReconciliationService`) already demonstrates repairing counter drift from a failed write (its own STORY-05-02 tests), which is exactly the mechanism BRD §4.9 AC3 relies on for post-outage recovery — this story doesn't duplicate that proof, it just names the dependency explicitly.
