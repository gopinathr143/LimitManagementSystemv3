# STORY-02-02 — Per-dimension window declaration

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-02 — Configuration, Dimensions and Limits](../epics/EPIC-02-configuration-dimensions-and-limits.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.3.1, 2.3 |
| **BRD UAT mapping** | UAT 41, UAT 42 |
| **Depends on** | STORY-02-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Each dimension declares the set of time windows it enforces, as a map keyed by window type whose values carry optional per-window overrides. A dimension needing both daily windows lists both. PER_TXN is stateless and is implicitly enabled for every dimension, so it is never declared and can never be de-activated by a registry edit.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | a dimension declaring only the calendar daily window | a rolling limit definition exists for it | no rolling counter is created, no rolling write occurs, and enforcement ignores the definition entirely |
| 2 | a dimension declaring both daily windows with different thresholds | a transaction breaches either one | the transaction is rejected, and each window rejects independently of the other |
| 3 | a dimension declaring only one daily window | a transaction is evaluated | the daily check runs against that window alone without error |
| 4 | a registry supplying windows as a plain array of window types | it is loaded | the engine normalises it to the canonical map form with default overrides |
| 5 | any dimension in any registry | the engine evaluates a transaction | the per-transaction check is available without PER_TXN being declared in the windows map |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design
- [ ] Registry validation rejects a dimension declaring no windows

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Window gating test | UAT 41 result showing an undeclared window produces no counter document | | |
| Dual-window test | UAT 42 result showing independent rejection on each daily window | | |
| Write-count proof | Instrumented run showing writes per transaction equals declared windows, not all window types | | |

## Notes / Risks

Declared windows are a direct cost multiplier. Each removed window is one fewer write on every transaction, so this story is also a latency lever.
