# STORY-06-04 — Data protection and access control

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
| **Status** | `Not Started` |
| **Priority** | Must |
| **Estimate (pts)** | 5 |
| **BRD reference** | Section 4.10 |
| **BRD UAT mapping** | None (compliance) |
| **Depends on** | STORY-06-01 |
| **Completed on** | _(date)_ |
| **Verified by** | _(name)_ |

> Status values: `Not Started` · `In Progress` · `In Review` · `Blocked` · `Done`
> When status changes, update **both** this file and `00-INDEX.md`.

## Description

The transaction collection holds customer identifiers and account numbers at very high volume, making it a material data protection asset under the applicable Indian data protection and card industry obligations.

## Acceptance Criteria

| # | Given | When | Then |
| :-- | :--- | :--- | :--- |
| 1 | all collections | storage is inspected | encryption at rest is enabled and transport is encrypted for client and intra-cluster connections |
| 2 | application logs and traces at any level | they are inspected | account numbers and customer identifiers are masked, and only the audit collection holds them in full |
| 3 | the application database principal | its privileges are inspected | it holds least privilege and has no write access to the client or configuration collections beyond what it requires |
| 4 | administrative endpoints | they are called with a tenant credential | access is refused, since admin and tenant roles are separate |
| 5 | field level encryption or tokenisation for sensitive identifiers | the assessment is completed | the decision and its rationale are recorded before launch |

## Definition of Done

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment
- [ ] Unit tests cover every AC branch, including the negative/failure path
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock)
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD
- [ ] BRD section updated if implementation diverged from the written design

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Encryption confirmation | Configuration evidence for at rest and in transit | | |
| Log audit | Sample logs demonstrating masking | | |
| Privilege matrix | Documented roles and their granted privileges | | |
| Compliance decision | Recorded field level encryption assessment outcome | | |

## Notes / Risks

_None recorded._
