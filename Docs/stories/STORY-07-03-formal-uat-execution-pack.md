# STORY-07-03 — Formal UAT execution pack

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-07 — Performance and Acceptance Certification](../epics/EPIC-07-performance-and-acceptance-certification.md) |
| **Status** | `In Review` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 6 |
| **BRD UAT mapping** | UAT 1 to UAT 44 |
| **Depends on** | STORY-07-01, STORY-07-02 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

Execute and record every acceptance case in the BRD, with each case traced to the story that implements it. A case with no recorded result is treated as failed.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | the full acceptance criteria list | execution completes | every case has a recorded pass, fail or accepted deferral with a written decision |
| 2 | each acceptance case | it is reviewed | it is traceable to at least one backlog story and that story is marked done |
| 3 | any failed case | it is recorded | a defect is raised and linked, and the related story returns to in progress |
| 4 | the acceptance pack | it is presented for sign-off | the business and risk owners record formal acceptance |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC1/AC2/AC3 pass as documentation/traceability work, verifiable against this repository's own test suite; AC4 (business/risk sign-off) is explicitly not obtainable in this session
- [ ] Unit tests cover every AC branch, including the negative/failure path — not applicable; this story's deliverable is a documentation artifact, not code
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock) — not applicable to this story directly; every PASS row in the execution pack cites a real integration test that itself runs against real MongoDB
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — not applicable to this story's scope
- [x] BRD section updated if implementation diverged from the written design — not applicable; no code changed for this story

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Execution matrix | Complete acceptance case results with pass and fail status | `Docs/UAT-EXECUTION-PACK.md` — all 52 UAT cases, each with an explicit status (never blank, per this story's own AC1: "a case with no recorded result is treated as failed") | |
| Traceability matrix | Mapping from every acceptance case to its implementing story | `Docs/UAT-EXECUTION-PACK.md` — every row names its implementing story | |
| Sign-off | Recorded business and risk owner acceptance | **Not obtained** — see `Docs/UAT-EXECUTION-PACK.md`'s Sign-off section; no business or risk owner exists in this session to review and formally accept | |

## Notes / Risks

**Result summary (full detail in `Docs/UAT-EXECUTION-PACK.md`):** 41 of 52 UAT cases PASS with a real, evidence-linked automated test; 2 (UAT 5, UAT 19 — the 1,000 RPS/1,000 incr-per-second throughput figures) have real local measurements but are honestly marked "measured, not certified" since this environment cannot stand in for the BRD's production-scale target; 1 (UAT 27) is superseded by the explicit no-authentication architectural decision; 8 (UAT 45-52) test EPIC-08, which was not built in this session and are marked "not yet implemented" rather than silently omitted.

**AC3's "that story is marked done"** doesn't hold literally for any story in this backlog yet: per this backlog's own Definition-of-Done rule (`00-INDEX.md`), a story is `Done` only after a shared-environment pass and a second-engineer review, neither of which has happened for any of the 38 stories across EPIC-01–07. Every implementing story cited in the execution pack is `In Review`, not `Done` — this is stated plainly rather than either overstating the pack's completeness or leaving the AC quietly unaddressed.
