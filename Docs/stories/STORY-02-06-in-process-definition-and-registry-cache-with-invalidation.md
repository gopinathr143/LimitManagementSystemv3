# STORY-02-06 — In-process definition and registry cache with invalidation

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `In Progress` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.3, 4.4, 4.1 |
| **BRD UAT mapping** | UAT 11 |
| **Depends on** | STORY-02-04 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Limit definitions and registry snapshots are cached in-process keyed by clientId and refreshed through a version bump or change-stream watch, so the transaction path never reads configuration from MongoDB. This is a hard requirement of the sub-100ms internal budget.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a service instance under transaction load | transactions are processed | no configuration read is issued to MongoDB on the transaction path, verified by query profiling |
| 2 | a limit definition updated on another instance | the change is committed | every instance reflects the change within the configured refresh interval without a restart |
| 3 | a cache refresh failure | the refresh attempt errors | the last known good snapshot stays in force, the failure is alerted, and enforcement is never disabled |
| 4 | multiple clients served by one instance | configuration is cached | cache entries are keyed by clientId and one client refresh does not evict or alter another client entry |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC2, AC3, AC4 pass locally against a real MongoDB replica set; AC1 is architecturally satisfied (`get()` is a synchronous in-memory Map read) but cannot be profiler-verified "on the transaction path" until EPIC-04 builds that path (see Notes)
- [x] Unit tests cover every AC branch, including the negative/failure path — `tests/unit/configCache.service.test.js`
- [x] Integration test runs against a real MongoDB replica set (not an in-memory mock) — `tests/integration/configCache.integration.test.js`
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — cache refresh failures are logged at error level (`src/services/configCache.service.js`); no metrics emitter yet (see STORY-02-01 DoD note)
- [ ] BRD section updated if implementation diverged from the written design — no divergence identified. **One deliberate simplification**: rather than diffing `configVersion`/`limitsVersion` to decide what to reload, the poll cycle unconditionally re-fetches and re-validates every cached client on each tick. The BRD sanctions polling as one of two acceptable invalidation mechanisms (§4.4) without mandating version-diff optimisation; this keeps the cache simpler at the cost of a slightly heavier poll, which is acceptable at the low frequency (default 2s) a config cache needs.

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Profiler output | MongoDB profiler showing zero config reads during a load run | Not obtainable yet — there is no transaction/enforcement path to profile until EPIC-04. What's proven now: `tests/unit/configCache.service.test.js` — "AC1: get() is a synchronous in-memory read, never touches the repositories" (asserts zero repository calls via a method spy) | |
| Propagation test | Measured time from a CRUD write to enforcement change across instances | `tests/integration/configCache.integration.test.js` — a CRUD write pushes an immediate `refreshOne`, observable in the same process with no measurable delay (push, not poll-wait). Cross-*instance* propagation (via polling) is unit-tested via `startPolling`/`stopPolling` but not exercised across two real running instances | |
| Degradation test | Result showing last known good config retained on refresh failure | `tests/unit/configCache.service.test.js` — "AC3: a refresh failure keeps the last known good snapshot and does not throw" | |

## Notes / Risks

**Scope note:** the cache mechanism itself — per-client Map, atomic whole-entry swap, push refresh on CRUD write, periodic poll backstop, fail-safe degradation — is fully implemented and tested. AC1's specific claim ("no configuration read is issued to MongoDB on the transaction path") can only be fully certified once EPIC-04 builds that path; what's certain today is that the cache's read API (`get`/`getRegistry`/`getDefinitions`) performs no I/O, which is the property EPIC-04 will depend on.
