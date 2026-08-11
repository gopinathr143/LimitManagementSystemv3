# STORY-06-04 — Data protection and access control

| Field | Value |
| :--- | :--- |
| **Epic** | [EPIC-06 — Operations, Resilience and Compliance](../epics/EPIC-06-operations-resilience-and-compliance.md) |
| **Status** | `In Review` |
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

- [ ] All Acceptance Criteria below pass in a shared (non-local) environment — AC2 (log masking) passes locally with a real test; AC1 (encryption infra), AC3 (real DB roles), AC4 (admin/tenant separation) and AC5 (compliance decision) are either infra this session cannot provision or are structurally inapplicable to the current no-authentication architecture (see divergence note)
- [x] Unit tests cover every AC branch that is code (log masking) — `tests/unit/logger.redaction.test.js`
- [ ] Integration test runs against a real MongoDB replica set (not an in-memory mock) — not applicable; nothing in this story's codeable scope (log redaction) touches the database
- [ ] Code reviewed and approved by a second engineer
- [ ] Structured logs and metrics emitted per Section 4.11 of the BRD — not applicable to this story's scope
- [x] BRD section updated if implementation diverged from the written design — see the AC4 divergence note below, the most significant one in this epic

## How to treat this story as complete

A story is **Done** only when every row below has recorded evidence. A ticked Definition of Done without evidence does not close the story.

| Check | Evidence required | Link / reference | Verified by |
| :--- | :--- | :--- | :--- |
| Encryption confirmation | Configuration evidence for at rest and in transit | **Not obtained.** Encryption at rest is a MongoDB deployment/storage-layer configuration (e.g. WiredTiger encrypted storage engine, or disk-level encryption on the hosting platform); TLS in transit is a driver/server configuration (`tls: true` on the connection string plus server-side certificates). Neither is configured in this local dev environment, and doing so meaningfully requires a real deployment target and certificates this session doesn't have. Recorded here as an explicit pre-launch requirement, not silently assumed done | |
| Log audit | Sample logs demonstrating masking | `tests/unit/logger.redaction.test.js` — top-level and one/two-level-nested `ucic`/`accountNumber` fields are censored; also documents the known finite-depth limitation of pino's redaction (see below) | |
| Privilege matrix | Documented roles and their granted privileges | See the recorded matrix below. Not enforced by an actual MongoDB user/role in this environment — this session doesn't have access to real deployment credentials to create one | |
| Compliance decision | Recorded field level encryption assessment outcome | **Not obtained** — already tracked as an open item in `00-INDEX.md` ("Field-level encryption decision for customer and account identifiers | STORY-06-04 | Compliance and Security") | |

## Notes / Risks

**Divergence (AC4) — admin vs. tenant credential separation does not apply to the current architecture, and this is by deliberate prior decision, not an oversight.** During EPIC-01/02 the user explicitly instructed removing all authentication ("We don't need authentication since consumers are from same cluster... we would need clientID validation whether client Id presents. In future, if we required authentication, we will onboard with OAuth authentication with Scope"). There are today no admin credentials and no tenant credentials to separate — every endpoint, including client/registry/limit CRUD (which a real deployment would treat as admin-only) and the transaction/reversal path (tenant-facing), is reachable by anyone with in-cluster network access, exactly the trust model already recorded for STORY-01-02. Bolting on a fake credential check here to satisfy this AC's letter would contradict that standing decision without adding real security (there'd be nothing to check it against). The documented future path is unchanged: OAuth + scopes, at which point admin/tenant separation becomes a real, checkable AC — see STORY-01-02's `Superseded` status and `00-INDEX.md`'s resolved-open-item note for the same decision.

**Privilege matrix (AC3), recorded as a design decision rather than an enforced role, pending real deployment credentials:**

| Principal | Collections | Privileges | Rationale |
| :--- | :--- | :--- | :--- |
| Application service account | `clients`, `configAudit`, `clientConfigs`, `limits`, `limitsAudit`, `counters`, `transactions`, `transactionsArchive`, `reconciliationQueue` | `find`, `insert`, `update`, `remove` (no `dropCollection`, no `dropDatabase`, no `changeStream`-admin-level privileges) | Everything the application layer itself needs to operate, least beyond that |
| Reporting/BI principal (future) | All collections | `find` only, and only via a secondary read preference (BRD §4.6: "reporting, exports and reconciliation reads MAY use secondaries") | Never on the enforcement path; must not be able to write |
| Migration/schema principal (Liquibase) | All collections | `createCollection`, `createIndex`, `collMod` (validator changes) | Used only at deploy time, not by the running service |

This matrix is a recorded intent for whoever provisions the real deployment's MongoDB users — it is not itself an executable artifact in this repository, since creating real least-privilege database users requires credentials and a target this session doesn't have.

**Redaction depth limitation, carried over from STORY-06-04's log-masking work:** pino's redaction engine (`fast-redact`) matches wildcards one segment at a time, not recursively — `REDACT_PATHS` in `src/config/logger.js` explicitly lists two levels of nesting. A code audit confirmed no current logger call anywhere logs an object nested deeper than that (every call site logs a small flat set of fields — `clientId`, `transactionId`, `appliedKey`, etc. — never a full request payload), so this is a documented, currently-inert limitation rather than an active gap; `tests/unit/logger.redaction.test.js` asserts the limitation explicitly so a future change to it is a deliberate, reviewed edit rather than a silent regression.
