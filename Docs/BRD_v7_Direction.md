# Business Requirements Document (BRD): IMPS Outward Velocity Limit System

**Project Version:** 7.0 (Direction-scoped: OUTWARD today, INWARD ready)
**Role:** Senior BA / Backend Architect
**Status:** Approved for Development

> **What changed from v6.0 → v7.0 — direction becomes a second scoping axis:**
> Every transaction now carries a **`direction`** (`OUTWARD` today, `INWARD` in future). Direction scopes the registry, limit definitions, counters and audit **alongside `clientId`** — it is deliberately *not* a dimension attribute and *not* a separate tenant (§2.1.5 explains why both alternatives fail). Each direction has its **own dimension registry**, so inward and outward can share a `dimensionCode`, differ entirely, or share one **`COMBINED`** counter where a total-throughput control is wanted (§2.1.7).
>
> **The physical change that must land now:** the direction segment enters the counter key and the transaction identity **in this release**, while only `OUTWARD` traffic exists. Adding it later would be a re-keying migration of every counter and a rewrite of the idempotency index; adding it now costs a constant string in a key. `INWARD` then ships as configuration plus attribute extraction, not as a data migration.
>
> **Also new:** per-client direction enablement (§2.1.8), direction in the transaction primary key (§3.1), backward-compatible registry normalisation (§4.3), combined-scope validation and sizing rules (§2.1.7, §4.2). UATs 45–52 added.

> **What changed from v5.0 → v6.0 — window types are now declared per dimension:**
> Each dimension in a client's registry now declares **which time windows it actually enforces**, via a `windows` map (§4.3). Previously every dimension implicitly supported every window, and only the presence of a limit definition decided what was evaluated. Now the registry — whose job is to bound cost and cardinality under review — governs windows too, exactly as it already governs dimensions.
>
> **Representation: a map, not a `BOTH` enum.** A dimension needing both daily windows lists both. See §4.3.1 for why a scalar `"window": "BOTH"` value was rejected.
>
> **Also new:** windows activate at the **next window boundary** to avoid a cold-start under-count (§4.3.2); reversal skips counters for de-activated dimension/window pairs (§3.4); per-window `shardFactor` and rolling `granularity` overrides (§4.3.3); CRUD warns when a limit definition would be inert (§4.4). UATs 41–44 added.
>
> **What changed from v4.0 → v5.0 — three correctness defects fixed:**
> 1. **Tier-1 check-and-increment was broken.** The guarded `updateOne` combined a range condition with `upsert: true`, which on a genuine breach throws `E11000 duplicate key` instead of returning `matchedCount === 0` — and the retry policy then misread that breach as a transient race. Split into an unconditional **bootstrap** plus a guarded update with `upsert: false` (§4.2.1).
> 2. **Concurrent duplicate Transaction IDs double-counted counters.** Idempotency was checked before validation but recorded only after, so two concurrent retries both ran the waterfall and both incremented. The transaction record is now a **`PENDING` claim written before validation** — the unique index becomes a true mutex (§3.1).
> 3. **`DAILY_ROLLING` could not be strictly enforced.** v4.0 promised hard enforcement for per-entity limits while spreading the rolling total across 25 separate hourly documents — an unavoidable read-then-write race. The rolling window is now a **single document with hourly sub-buckets updated by an atomic aggregation-pipeline update** (§4.2.5).
>
> **Also new:** safe `shardFactor` change semantics (§4.2.6), mandatory `primary` read preference (§4.6), audit retention & archival at 1,000 RPS (§4.7), a counter **reconciliation sweeper** (§3.5), threshold-change and threshold-boundary semantics (§2.3), clock-skew tolerance (§4.8), DR/fail-closed posture (§4.9), data protection (§4.10), and monitoring (§4.11). UATs 29–38 added.
>
> **Retained from v4.0:** full multi-tenancy — every request, config, dimension registry, limit definition, counter and audit record is scoped to a `clientId`, and each client has its own allowed-dimensions registry.
>
> **Retained from v3.0:** Redis removed; MongoDB-only; sustained **1,000 RPS** including a single logical counter incremented up to 1,000×/second, via counter-sharding, single-document atomic operations, bucketed windows and TTL cleanup; cross-document atomicity approximated by a compensating saga.

---

## 1. Executive Summary
The objective is a high-performance, **multi-tenant** Velocity Limit Management System for IMPS Outward transactions. The system enforces limits across a **generic, configuration-driven set of dimensions** — any combination of transaction attributes — across multiple time windows, **independently for each onboarded client**, with a strict audit trail, idempotent request handling, and transactional integrity within a single datastore (MongoDB).

Each client is an isolated tenant: its dimension registry, limit definitions, velocity counters and audit trail are partitioned by `clientId` and never commingle. New dimension types (per client) and new clients are introduced without code changes. The system is engineered to sustain **1,000 RPS for the current single client**, scaling horizontally as clients are onboarded (§4.5).

**Enforcement posture:** the system is a financial risk control and therefore **fails closed** in every ambiguous or degraded state — unknown client, missing mandatory limit, datastore unavailable, or unresolvable configuration (§4.9).

---

## 2. Functional Requirements

### 2.1 Client / Tenancy Model
A **client** is a consuming system (a bank product, a channel operator, a partner platform) that submits transactions to this gate and has its own limit policy.

**2.1.1 Client identity & trust.**
*   Every inbound request is associated with a `clientId` **derived from the authenticated principal** (API key / mTLS client certificate / OAuth client credential), *never* taken on trust from a request field. If the payload also carries a `clientId`, it must match the authenticated principal; a mismatch is rejected. This is the load-bearing control preventing one tenant from reading or mutating another's counters, limits or audit records.
*   Requests from an **unknown, inactive or suspended** client are rejected (fail closed) before any validation or counter access.

**2.1.2 Client registry (`clients` collection).** `clientId` (stable, unique), `name`, `status` (`ACTIVE`/`SUSPENDED`), authentication binding (credential/cert fingerprint), `timezone` (§4.8), `createdBy`, `createdAt`, `updatedAt`. Only `ACTIVE` clients are processed.

**2.1.3 Isolation model.** Tenants share collections (`transactions`, `limits`, `counters`, `clientConfigs`) with a **mandatory `clientId` discriminator** on every document and as the leading segment of every key, index and query (logical isolation). A client with regulatory or data-residency requirements may be physically partitioned into a dedicated database or cluster **without application changes**, because all access is already `clientId`-scoped. The isolation decision is per client, made at onboarding.

**2.1.4 Everything below is per client and per direction.** Where this document says "the system" evaluates dimensions or maintains counters, it means *for the requesting client and the transaction's direction, using that client-and-direction's registry and definitions*. `GLOBAL` means **system-wide for that client in that direction**, not across all clients and not across both directions — unless the dimension is explicitly declared `COMBINED` (§2.1.7).

### 2.1A Transaction Direction Model *(new in v7.0)*

**2.1.5 Direction as a second scoping axis.** Every transaction has a **`direction`**: `OUTWARD` (funds leaving, the current release) or `INWARD` (funds arriving, a future release). Direction is a **scoping axis alongside `clientId`**, not a dimension attribute and not a separate tenant.

This distinction is deliberate and load-bearing:
*   **Not a dimension attribute.** Adding `direction` to a dimension's `attributes` list would separate *counters* by direction but leave a single shared dimension registry. The requirement is that the **dimension sets themselves differ** — inward and outward are different risk problems with different attributes (outward risk is debit-side and payer-centric; inward risk is credit-side and payee-centric, concerned with unusual credit patterns and mule-account behaviour). A shared registry cannot express that.
*   **Not a separate client.** Encoding direction into `clientId` (e.g. `CLIENT_A_INWARD`) would fracture tenancy, duplicate the client record, break cross-direction reporting, and make a combined limit (§2.1.7) impossible to express. Direction is a property of the *transaction*, not of the *tenant*.

Consequently the scope of every registry, limit definition and counter is the pair **`(clientId, direction)`**.

**2.1.6 Direction resolution and trust.** Unlike `clientId`, direction **cannot** be derived from the authenticated principal — the same client submits both directions over the same credential. It is therefore an **explicit, mandatory, validated request field**:
*   A request with a missing, empty or unrecognised `direction` is **rejected (fail closed)** before any validation or counter access. There is no default direction; defaulting an absent value to `OUTWARD` would silently mis-scope inward traffic into outward counters.
*   Each client declares the directions it is **enabled** for (§2.1.8). A request whose direction is not enabled for that client is rejected, even if the direction is valid in principle. This is what allows `INWARD` to ship as inert code and be switched on per client under review.
*   Direction is recorded on every audit record and every applied counter key (§3.2).

**2.1.7 Per-direction, shared, and combined dimensions.** A `dimensionCode` may appear in one direction's registry, in both, or in neither. Where the same code appears in both directions, its counters are **separate by default** — `UCIC` outward velocity and `UCIC` inward velocity are distinct totals, because they answer different risk questions.

Three declarable scopes cover the realistic cases:

| `directionScope` | Counter key direction segment | Meaning | Typical use |
| :--- | :--- | :--- | :--- |
| `PER_DIRECTION` *(default)* | the transaction's direction | Separate totals per direction, even where the code and attributes are identical. | Nearly everything. Outward daily spend vs inward daily credit. |
| `COMBINED` | the literal `ALL` | One shared total that **both** directions increment and check. | Total exposure caps — e.g. a customer's combined daily turnover across both directions, or a mule-detection cap on total account throughput. |
| `DIRECTION_ONLY` | the transaction's direction | Identical mechanics to `PER_DIRECTION`; a documentation marker for a dimension that exists in exactly one direction's registry and has no counterpart. | `REMITTER_IFSC` inward-only; `BENEFICIARY_VPA` outward-only. |

`COMBINED` must be declared **identically in both directions' registries** (same `dimensionCode`, same ordered attributes, same windows). Registry validation rejects an asymmetric `COMBINED` declaration, because two directions writing the same counter under different attribute orders would silently corrupt the shared total.

**2.1.8 Client direction enablement.** The `clients` record carries `enabledDirections` (e.g. `["OUTWARD"]` today, `["OUTWARD","INWARD"]` later). Enabling a direction requires that direction's registry to exist and to validate — including its own mandatory Global Per-Transaction limit (§5). A direction cannot be enabled with an empty or invalid registry, so there is no window in which inward traffic is accepted but ungoverned.

### 2.2 Generic Dimension Model (client-scoped)
A **dimension** is any combination of one or more transaction attributes (`channel`, `ucic`, `accountNumber`, `mcc`, or any future attribute), allowing single-attribute and composite limits without code changes.

Dimensions are governed by a **per-client, per-direction allowed-dimensions registry** (§4.3) — not hardcoded, not shared across clients, and not shared across directions unless explicitly declared `COMBINED` (§2.1.7). Each entry declares a `dimensionCode`, the ordered attribute list forming its key, a **`hot` flag / `shardFactor`** controlling counter-sharding (§4.2), and — new in v6.0 — the **set of time windows that dimension enforces** (§4.3.1). Two clients may declare different dimension sets, different attribute compositions under the same code, different windows, different thresholds and different sharding policies.

Illustrative **`OUTWARD`** registry for the current (single) client. The `INWARD` registry is a separate list under the same client and is shown in §4.3:

| dimensionCode | Attributes | Cardinality | Hot? | Enforced windows | Example |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GLOBAL` | *(none)* | 1 bucket / client | **Yes** (shard) | Calendar + Rolling + Monthly | System-wide **for this client** — ~100% of the client's traffic. |
| `CHANNEL` | `channel` | very low | **Yes** (shard) | Calendar + Monthly | A handful of channels; one may carry most traffic. |
| `UCIC` | `ucic` | very high | No | Calendar + Rolling + Monthly | Per customer, across all their accounts. |
| `ACCOUNT` | `accountNumber` | very high | No | Calendar + Rolling | Per specific account. |
| `MCC` | `mcc` | low–medium | Optional | Monthly | Per merchant category code. |
| `UCIC_CHANNEL` | `ucic`, `channel` | very high | No | Calendar | Per customer, per channel. |
| `UCIC_MCC` | `ucic`, `mcc` | very high | No | Calendar + Monthly | Per customer, per merchant category. |

A dimension that needs **both** daily windows simply declares both (`GLOBAL`, `UCIC` above); one that needs only the calendar day declares only that (`UCIC_CHANNEL`). There is no separate "both" mode — see §4.3.1.

**Cardinality remains the sharding driver, evaluated within each client.** A dimension hot for a high-volume client may not need sharding for a low-volume one — hence `hot`/`shardFactor` are per-client. **Declared windows are now the second cost driver:** each enforced window is an additional counter document and an additional write per transaction, so the registry bounds *dimensions × windows*, not just dimensions. Registries are illustrative, not exhaustive; rows are added without engine code changes.

### 2.3 Limit Types & Window Logic
For every dimension in the **requesting client's** registry, the system independently tracks and validates, wherever a limit is configured:

1.  **Per Transaction Limit:** max amount for a single request. *(Stateless — no counter, no contention; §4.2.0.)*
2.  **Daily Amount & Count Limit (Dual-Window Check):**
    *   **Calendar Day Window:** fixed, resets at 00:00:00 in the client's timezone (§4.8).
    *   **Rolling Window:** sliding 24-hour window.
    *   *Rule: rejected if it breaches EITHER the Calendar Day OR the Rolling Window limit.*
3.  **Monthly Amount & Count Limit:** cumulative within a calendar month (client timezone).

**Amount and Count are independent, both-checked metrics.** A definition may configure `thresholdAmount`, `thresholdCount`, or both; a breach of **either** rejects. `Per Transaction Limit` is amount-only.

**2.3.1 Threshold boundary semantics *(new — was ambiguous).*** Thresholds are **inclusive maxima**. A transaction is permitted when the resulting cumulative value is **less than or equal to** the threshold, and breaches when it would be **strictly greater**. Formally, for amount: permit iff `currentAmount + txnAmount ≤ thresholdAmount`; for count: permit iff `currentCount + 1 ≤ thresholdCount`. Per-Transaction: permit iff `txnAmount ≤ thresholdAmount`. This is stated normatively so implementation, test and business interpretation cannot diverge at the boundary.

**2.3.2 Amount units & currency *(new).*** All amounts are stored and compared as **integers in minor units (paise)**. No floating-point arithmetic is used for money anywhere in the counter or threshold path. IMPS is INR-only; a `currency` field is reserved on limit definitions for future multi-currency clients but is fixed to `INR` in this release.

**2.3.3 Threshold changes mid-window *(new — was unspecified).*** Velocity already accumulated in an open window is **not** re-based when a threshold changes. A new threshold applies immediately to subsequent transactions and is compared against the **existing accumulated velocity**. Consequently, lowering a threshold below a customer's already-consumed velocity causes subsequent transactions in that window to be rejected until the window rolls — this is intended, fail-closed behaviour for a risk control. Limit changes are versioned and audited (§4.4) so a rejection can always be explained against the threshold in force at that instant.

**Applicability *(revised in v6.0)*:** Daily and Monthly windows apply to a dimension **only where that window is declared in the client's registry** (§4.3.1). A window not declared for a dimension is never evaluated, never counted and never written — regardless of whether a limit definition exists for it (such a definition is stored but inert, exactly as for an unactivated dimension). Where a window *is* declared but has no configured limit, it is "Unlimited" for that check (§5).

**Dual-window degeneration:** the Daily dual-window rule (§2.3 item 2) applies to whichever daily windows a dimension declares. If a dimension declares only `DAILY_CALENDAR`, the daily check is that window alone; the "EITHER breach rejects" rule applies across the declared daily windows.

**Per-Transaction is never gated *(new)*:** `PER_TXN` is stateless — no counter, no write, no cardinality (§4.2.0). It is therefore **implicitly enabled for every dimension** and is **not** listed in `windows`; there is no cost to govern. This also removes any possibility of a registry edit accidentally de-activating the mandatory Global Per-Transaction cap (§5). As always, a per-transaction check only fires where a limit definition exists.

**Write-load optimization:** a counter document is maintained **only** for dimension/window combinations with an active limit for that client. "Undefined = Unlimited" means *no counter and no write*.

### 2.4 Validation Logic (Config-Driven Waterfall)
1.  **Resolve tenant and direction:** authenticate → derive `clientId` → confirm `ACTIVE` → read the explicit `direction` from the request → confirm it is enabled for that client (§2.1.8). Any failure here fails closed before any counter access. Load the snapshot and limit cache **for that `(clientId, direction)` pair** (§4.3).
2.  **Claim the transaction:** insert the `PENDING` idempotency record (§3.1). A duplicate-key collision here means the transaction is already in flight or complete — return its stored status without touching counters.
3.  **Iterate the `dimensionCode` entries declared for that client *and direction*** in declared order. A dimension present only in the other direction's registry is not evaluated. For each dimension:
    1.  Extract that dimension's attribute values. Missing required attribute → dimension skipped as not applicable.
    2.  Look up the active limit for that client + dimension + attribute values (§2.5) **for each window the dimension declares** (§4.3.1), evaluated in the fixed order Per-Txn → Daily Calendar → Daily Rolling → Monthly. Undeclared windows are skipped without a lookup, a counter read or a write.
    3.  Check velocity against each configured threshold (§2.3.1). First breach rejects immediately; counters already incremented for *this* transaction are compensated (§3.3).
4.  If every dimension passes (or has no applicable limit): resolve the claim to **`APPROVED`**.

**Execution model:** each dimension/window's check-and-increment is one atomic single-document operation (§4.2); the set of dimensions is a **compensating saga** (§3.3), not a cross-document atomic script. All accesses are primary-key (`_id`) lookups whose keys begin with `clientId`.

### 2.5 Limit Definitions vs. Limit Instances (client-scoped)
A limit **definition** (§4.4) is a *default* rule for a `(clientId, dimensionCode)` — not one row per customer — and may pin specific attribute values (a **scope override**) taking precedence over the client's dimension default. The counter document `_id` is always instance-specific and **always prefixed with `clientId`**, built from the real attribute values on each transaction, never from the wildcard default (§4.2).

---

## 3. Idempotency, Audit & Transactional Integrity

### 3.1 Idempotency Handling — claim-before-validate *(DEFECT FIX)*

**Problem in v4.0.** The existence check ran *before* validation but the record was written *after*. Two concurrent retries of the same `(clientId, transactionId)` both saw "no record", both ran the full waterfall, and **both incremented counters**; only one won the final insert, leaving the loser's increments permanently double-counted. Since §3.3 instructs consumers to retry on `500`, this race was actively induced by the design.

**v5.0 behaviour — the record is a claim, not a receipt:**

1.  **Claim:** attempt `insertOne({ _id: {clientId, direction, transactionId}, status: "PENDING", requestData, claimedAt: now, instanceId })` **before any validation or counter access**.
2.  **If the insert succeeds:** this request owns the transaction. Proceed with the waterfall (§2.4).
3.  **If the insert fails with `E11000`:** the transaction is already claimed. Re-fetch and:
    *   `APPROVED` / `REJECTED` / `REVERSED` → return the stored result verbatim (no re-validation, no re-increment).
    *   `PENDING` → another request is mid-flight. Return **`409 Conflict`** (or the configured in-progress response) so the caller retries after a short delay. Never proceed — proceeding is exactly the double-count bug.
4.  **Resolve:** at the end of the waterfall, update the claim in place to `APPROVED` or `REJECTED`, attaching applied counter keys and any breach details.

**Uniqueness scope *(extended in v7.0)*:** the unique index is the **compound `(clientId, direction, transactionId)`**. `transactionId` alone is unsafe because different clients may legitimately mint the same value; **`(clientId, transactionId)` alone is also unsafe once `INWARD` exists**, because inward and outward flows are typically fed by different upstream systems with independent identifier sequences. A collision across directions under the narrower key would return an *outward* decision for an *inward* request — a wrong-answer bug, not merely a duplicate. Including direction removes that class of error entirely. Using this compound as the document `_id` keeps the mutex free (the primary-key index is inherently unique) and removes a secondary index from the hot path.

**API consequence:** the reversal endpoint (§3.4) and any status lookup must carry `direction` alongside the Transaction ID. The field is introduced **now**, while only `OUTWARD` exists, so the consumer contract does not change twice. Callers omitting `direction` MAY be defaulted to `OUTWARD` during the single-direction period; that leniency is **withdrawn when a client enables a second direction**, and the withdrawal must be an explicit, announced step rather than a silent behaviour change.

**Why this is now correct:** the unique index is the single serialization point. A duplicate can never reach the counter path, so counters cannot be double-incremented by concurrent retries. Each claim is a distinct new document, so claims spread across the collection and are not subject to the hot-document problem.

**3.1.1 Stale `PENDING` reaper.** A process that crashes mid-waterfall leaves an orphaned `PENDING` claim, which would block legitimate retries forever. A sweeper resolves claims older than a configurable threshold (default **60 seconds**, comfortably above the 700ms SLA) to `ABANDONED`, freeing the Transaction ID for a fresh retry. Because a crashed request may have applied counter increments it could not compensate, any `ABANDONED` claim is referred to the reconciliation sweeper (§3.5), which is the authoritative repair path. **The `transactions` collection is never TTL-deleted for this purpose** — reaping is a status transition, not a delete.

### 3.2 Audit Logging (MongoDB)
Every request is persisted in `transactions` with:
*   **`clientId`** and **`direction`** (leading fields of the `_id`, inherently indexed).
*   **Request Data:** Transaction ID, UCIC, Account Number, Amount, Channel, MCC, Timestamp.
*   **Status:** `PENDING`, `APPROVED`, `REJECTED`, `REVERSED`, `ABANDONED`, or `SYSTEM_FAILURE`.
*   **Rejection Details (if applicable):** breached `dimensionCode` + `windowType` + resolved attribute values; breached metric (`AMOUNT`/`COUNT`); the threshold **and the limit-definition version** in force (§2.3.3); current velocity (amount **and** count).
*   **Applied Counter Keys (if approved):** counter-document `_id`s incremented (each `clientId`- and direction-prefixed), tagged with `dimensionCode`, `windowType`, **the direction segment actually used** (the transaction's direction, or `ALL` for a `COMBINED` dimension), resolved attribute values, and — for sharded counters — the **specific bucket `_id`** and the `shardFactor` in force, so reversal targets exact documents, a dimension later removed from the registry is still identifiable, and reconciliation (§3.5) can rebuild totals.

### 3.3 Atomic Orchestration & Failure Handling (Compensating Saga)
No cross-document atomic primitive is used on the hot path; a multi-document ACID transaction touching the client's shared `GLOBAL` document on every request would cause a `WriteConflict` storm at 1,000 RPS (§4.2.4). Per transaction, **after the claim in §3.1 succeeds**:

1.  **Stateless checks first:** all Per-Transaction limits (incl. the client's mandatory GLOBAL cap). Breach → resolve claim to `REJECTED`, zero counter writes.
2.  **Windowed check-and-increment, per dimension, in declared order:** Tier-1 bootstrap + guarded update (§4.2.1), Tier-2 sharded increment (§4.2.2), or the rolling-window pipeline update (§4.2.5). Track each applied counter key/bucket.
3.  **On first breach:** stop, **compensate** (decrement applied counters in reverse), resolve claim to `REJECTED` with breach details, return the rejection.
4.  **If all pass:** resolve claim to `APPROVED` with applied counter keys.
5.  **If the resolve write fails after retries:** compensate all applied counters, mark `SYSTEM_FAILURE` (best effort), return `500`.
6.  **Internal retry:** on **transient** errors — `WriteConflict`, network blips, primary step-down — retry the failing single-document op **3×** with backoff **20ms / 40ms / 80ms**. **A limit breach is not a transient error and is never retried** (see §4.2.1 — this distinction is what v4.0 got wrong).
7.  **Consumer expectation:** the consumer retries on `500` with the same `(clientId, transactionId)`; §3.1 makes this safe. On `409` the consumer retries after a short delay.

**Consistency note:** a transaction that ultimately rejects may briefly increment-then-compensate counters; a concurrent transaction could be **conservatively false-rejected** in that sub-millisecond window. The error direction is always toward rejection, never over-approval.

### 3.4 Reversal / Compensation API (client-scoped)
*   **Input:** `clientId` (from auth) + `direction` + Transaction ID (§3.1).
*   **Behaviour:**
    1.  Look up `(clientId, direction, transactionId)`; must be `APPROVED` (else no-op/error). A `COMBINED` counter applied by this transaction is decremented on its shared `ALL` key, exactly as recorded.
    2.  Decrement the exact counter documents recorded at approval (§3.2). For a sharded counter, decrement the **recorded bucket**. Skip (no-op, logged) if the document has TTL-expired, its `dimensionCode` was removed from the client's registry, **or its `windowType` was de-activated for that dimension since approval** *(new in v6.0)* — the counter is no longer governed at runtime, so it is not touched. Because §3.2 records `windowType` alongside every applied key, a de-activated window remains identifiable at reversal time without re-deriving it from the current registry.
    3.  Set status `REVERSED` with timestamp and reason.
*   **Idempotency:** enforced by conditional update `updateOne({_id:{clientId,direction,transactionId}, status:"APPROVED"}, {$set:{status:"REVERSED", …}})`; `matchedCount === 0` means already reversed → no-op.
*   **Ordering:** the status flip is attempted **first**; only on `matchedCount === 1` are decrements applied. This prevents two concurrent reversal calls from both decrementing.
*   **Floor guard:** counters must never go negative. Decrements are guarded (`{_id: key, amount: {$gte: txnAmount}}`) and a failed guard is logged as a drift signal to reconciliation (§3.5) rather than silently applied.

### 3.5 Counter Reconciliation Sweeper *(new — closes the compensation-failure gap)*
Compensation (§3.3) can itself fail after retries, leaving a counter permanently inflated — which silently over-rejects legitimate customer transactions. Similarly, a crashed request (§3.1.1) may leave increments no one compensated. The `transactions` collection is the **system of record** and already stores every applied counter key, so counters are derivable and therefore repairable.

*   **Mechanism:** a scheduled job recomputes, per client and per open window, the expected `amount`/`count` for a sampled or targeted set of counter keys by aggregating `APPROVED` (minus `REVERSED`) transaction records, and compares against the live counter documents.
*   **Triggers:** always for keys flagged by a failed compensation, a failed decrement floor guard, or an `ABANDONED` claim; plus a periodic sweep of hot keys and a full nightly pass per closed window.
*   **Action:** drift beyond a configured tolerance raises an alert (§4.11) and, for closed windows, corrects the counter. **Corrections to open windows are alert-first, auto-correct-by-policy** — silently rewriting a live risk counter is itself a risk.
*   **Note on Tier 2:** sharded counters have an accepted bounded overshoot by design (§4.2.2); the reconciliation tolerance for hot keys is set above that bound so normal operation does not generate noise.

---

## 4. Technical Specifications & SLAs

### 4.1 Performance Benchmarks
*   **Throughput:** sustain **1,000 RPS** for the current single client; scale horizontally per additional client (§4.5).
*   **Hot-counter write rate:** sustain up to **1,000 increments/second against a single logical counter per client** via counter-sharding (§4.2.2) — never by writing one physical document 1,000×/second (§4.2.4).
*   **End-to-End Latency:** **500ms–700ms**.
*   **Internal Engine Latency:** **< 100ms** on the happy path — primary-key (`_id`) access only, in-process caches for per-client limit definitions and hot-counter totals, pipelined single-document ops.
*   **Added write cost:** the claim (§3.1) adds one indexed insert and one update per transaction. This is a distributed, non-contended write and is budgeted within the <100ms envelope; it is the deliberate price of correct idempotency.

### 4.2 MongoDB Counter Model & Concurrency Design

Counters live in the `counters` collection. The `_id` is built programmatically and **always begins with `clientId` followed by the direction segment**:

`limit:{clientId}:{direction}:{dimensionCode}:{windowType}:{attrValue1}|{attrValue2}|...:{windowBucket}`

*   `clientId` leads → tenant isolation, and clean distribution under cluster sharding (§4.5).
*   **`direction`** *(new in v7.0)* is the transaction's direction (`OUTWARD`/`INWARD`) for a `PER_DIRECTION` or `DIRECTION_ONLY` dimension, or the literal **`ALL`** for a `COMBINED` dimension (§2.1.7). Placing it immediately after `clientId` means inward and outward traffic can never collide on the same counter document, and a client's counters remain contiguous by direction for operational queries.
*   Examples: `limit:CLIENT_A:OUTWARD:UCIC:DAILY_CALENDAR:U12345:2026-08-10` · `limit:CLIENT_A:INWARD:UCIC:DAILY_CALENDAR:U12345:2026-08-10` · `limit:CLIENT_A:ALL:UCIC:DAILY_CALENDAR:U12345:2026-08-10` (combined)
*   **Load implication:** enabling `INWARD` adds a second, independent set of counter documents. A `PER_DIRECTION` hot dimension is hot *twice* — once per direction — each sized by that direction's own rate, so `shardFactor` is declared per direction (§4.3). A `COMBINED` hot dimension is the opposite case and needs particular care: it absorbs the **sum of both directions' write rates on one logical counter**, so its `shardFactor` must be sized against the combined rate, not either direction alone.
*   Attribute values are concatenated in the fixed order declared for that `dimensionCode` in *that client's* registry.
*   `windowBucket` is the calendar day or year-month; sharded counters append `#{n}`.
*   Examples: `limit:CLIENT_A:UCIC:DAILY_CALENDAR:U12345:2026-08-10` · `limit:CLIENT_A:GLOBAL:DAILY_CALENDAR:2026-08-10#7`

```json
{
  "_id": "limit:CLIENT_A:UCIC:DAILY_CALENDAR:U12345:2026-08-10",
  "clientId": "CLIENT_A",
  "amount": 14500000,
  "count": 12,
  "updatedAt": "2026-08-10T09:15:00Z",
  "expireAt": "2026-08-11T00:05:00Z"
}
```
*(`amount` in paise — §2.3.2.)* A **TTL index on `expireAt`** auto-cleans past-window documents. `clientId` is also stored as a field to support per-client scans, exports and physical partitioning.

#### 4.2.0 Tier 0 — Per-Transaction (stateless, zero contention)
Per-Transaction limits need **no counter and no write** — a direct `txnAmount ≤ thresholdAmount` comparison. The client's mandatory GLOBAL Per-Transaction cap therefore has zero contention cost and is exactly enforced even at 1,000 RPS.

#### 4.2.1 Tier 1 — High-cardinality counters: bootstrap + guarded update *(DEFECT FIX)*

**Problem in v4.0.** The single guarded upsert was:
```js
updateOne({ _id: key, amount: {$lte: thresholdAmount - txnAmount} }, {...}, { upsert: true })  // BROKEN
```
When the document exists but the guard fails — a **genuine breach** — the query matches nothing, so MongoDB takes the upsert path, builds a candidate document from the query's *equality* fields only (`_id`; range conditions are never used to construct the insert), and attempts an insert that collides with the existing `_id`. The result is **`E11000 duplicate key`, not `matchedCount === 0`**. Because §3.3 classified duplicate-key as a transient bootstrap race, every real breach would have burned three retries (~140ms) and then surfaced as an error rather than a clean, fast rejection.

**v5.0 — two unambiguous steps.**

**Step A — bootstrap (unconditional, no guard):** materialize the window document if absent.
```js
db.counters.updateOne(
  { _id: key },
  { $setOnInsert: { clientId, amount: 0, count: 0, expireAt: windowExpiry } },
  { upsert: true }
);
// E11000 here IS the benign concurrent-bootstrap race → swallow and continue.
```

**Step B — guarded check-and-increment (`upsert: false`):**
```js
const res = db.counters.updateOne(
  {
    _id: key,
    amount: { $lte: thresholdAmount - txnAmount },   // include only if an amount limit is configured
    count:  { $lte: thresholdCount  - 1 }            // include only if a count  limit is configured
  },
  {
    $inc: { amount: txnAmount, count: 1 },
    $set: { updatedAt: now }
  },
  { upsert: false }                                   // ← the fix
);
```
*   `res.matchedCount === 1` → **within limit, incremented, pass.**
*   `res.matchedCount === 0` → **breach. Unambiguous, immediate, never retried.** The engine then reads the document once to record exact current velocity in the audit.
*   `E11000` can no longer occur on Step B, so duplicate-key retains exactly one meaning (benign bootstrap race in Step A).

The guard encodes the inclusive semantics of §2.3.1. Step A is skipped on the fast path when the key is already in the instance's "known-bootstrapped" set for the current window, and an optional pre-warm job creates next-window documents at rollover — so the steady-state cost remains a single round trip. These documents spread across millions of `_id`s per client, so none is individually hot and the strict path is both correct and fast.

#### 4.2.2 Tier 2 — Hot / low-cardinality counters (sharded)
For dimensions a client flags `hot` (that client's `GLOBAL` always; usually `CHANNEL`), the logical counter is split into `shardFactor` bucket documents:

`limit:CLIENT_A:GLOBAL:DAILY_CALENDAR:2026-08-10#0` … `#{shardFactor-1}`

*   **Increment:** pick a bucket pseudo-randomly and `$inc` it (unconditional, in-place). At `shardFactor: 32`, ≈ 31 writes/sec per document at 1,000 RPS.
*   **Check:** logical total = sum of that client's buckets (aggregation, or the cached total, §4.2.3).
*   **Enforcement semantics:** hot-counter limits are **soft (approximate) with a bounded overshoot** proportional to in-flight concurrency — an accepted trade-off for system-wide safety caps. **Strict enforcement is preserved for per-entity limits (UCIC/ACCOUNT), which are Tier 1 and never sharded.** The one hard GLOBAL guarantee — the Per-Transaction cap — is Tier 0 and exact.
*   **Reversal:** decrement the recorded bucket, with the floor guard of §3.4.
*   **Tuning:** per client, per dimension. Rule of thumb `shardFactor ≥ ceil(clientPeakLogicalWriteRate / ~50)`. A low-volume client may set `hot:false` and skip sharding.

#### 4.2.3 Hot-counter read optimization — cached running total
Each service instance caches hot-counter totals keyed by `(clientId, counterKey)` with a short refresh interval (100–250ms), so the hot-path check reads from memory. Tolerates bounded staleness (≤ refresh interval), consistent with soft-limit semantics. **Only Tier-2 counters are cached; Tier-1 and rolling-window per-entity counters are always checked live** against the primary (§4.6).

#### 4.2.4 Why a single hot document cannot simply be hammered
WiredTiger uses document-level optimistic concurrency; concurrent writers to the same `_id` collide and retry on `WriteConflict`. A single hot document tops out well below 1,000 sustained updates/second at acceptable latency, with p99 degrading sharply. Counter-sharding converts one 1,000-writes/second document into `shardFactor` documents at ~1000/`shardFactor` each. **Cluster-level sharding does not fix a single hot `_id`** (it lives on one shard) — the counter must be split at the application level.

#### 4.2.5 Rolling 24-hour window — single-document atomic pipeline update *(DEFECT FIX)*

**Problem in v4.0.** The rolling total was spread across 25 separate hourly documents. A total spread across 25 documents **cannot** be validated by a single-document conditional update — it requires read-sum-then-increment, which is precisely the race Tier 1 exists to eliminate. v4.0 therefore promised hard per-entity enforcement (§5) that the design could not deliver on the rolling window — the control most directly tied to velocity risk.

**v5.0 — one document per entity, hourly sub-buckets, atomic pipeline update.** For non-hot dimensions the rolling window is a **single document** holding its hourly buckets as sub-fields:
```json
{
  "_id": "limit:CLIENT_A:UCIC:DAILY_ROLLING:U12345",
  "clientId": "CLIENT_A",
  "buckets": { "2026-08-10-07": { "a": 250000, "c": 2 },
               "2026-08-10-08": { "a": 100000, "c": 1 } },
  "expireAt": "2026-08-11T10:00:00Z"
}
```
A **MongoDB 5.0+ aggregation-pipeline update** executes prune → sum → conditional-increment **atomically within the one document**, and `findOneAndUpdate` returns the outcome in a single round trip:
```js
db.counters.findOneAndUpdate(
  { _id: rollingKey },
  [
    // 1. Prune buckets outside the 24h horizon (self-maintaining — no cleanup job).
    { $set: { buckets: { $arrayToObject: { $filter: {
        input: { $objectToArray: "$buckets" },
        cond:  { $gte: ["$$this.k", oldestValidBucket] } } } } } },
    // 2. Sum the live window.
    { $set: { _sumA: { $sum: "$buckets.a" }, _sumC: { $sum: "$buckets.c" } } },
    // 3. Conditionally apply the increment; record whether it was applied.
    { $set: {
        _applied: { $and: [ { $lte: [ { $add: ["$_sumA", txnAmount] }, thresholdAmount ] },
                            { $lte: [ { $add: ["$_sumC", 1] },         thresholdCount  ] } ] } } },
    { $set: { buckets: { $cond: [ "$_applied", <buckets with current hour incremented>, "$buckets" ] } } }
  ],
  { returnDocument: "after", upsert: true }
);
```
*   `_applied: true` → within limit, incremented, **pass**. `_applied: false` → **breach**, and the returned document carries exact current velocity for the audit — no second read.
*   **Strict enforcement restored:** check and increment are one atomic document operation, so no concurrent transaction can interleave between the sum and the write. The §5 promise that per-entity limits are hard now holds for the rolling window.
*   **Self-pruning:** the document is bounded to ~25 buckets; expired buckets are dropped in the same operation. Bucket keys use hyphens (never dots) so they are legal field names.
*   **Precision:** accurate to bucket granularity (±1 hour of tail). Minute buckets are configurable per dimension where tighter precision is required, at ~1,440 sub-fields per document.
*   **Hot dimensions:** a `hot` rolling counter is additionally sharded (`#{n}` suffix) and reverts to Tier-2 soft semantics — the strict guarantee is offered for the high-cardinality per-entity dimensions where it matters and is achievable.
*   **Prerequisite:** MongoDB **5.0 or later** for pipeline updates. This is a hard platform requirement of this release.

#### 4.2.6 Safe `shardFactor` changes *(new — closes a fail-open hole)*
Changing `shardFactor` on a live window is unsafe if handled naively: **lowering** it (e.g. 32 → 16) orphans buckets `#16–31`, whose balances silently drop out of the sum, **under-counting velocity and over-approving** — a fail-*open* direction that contradicts this system's safety posture.

Rules:
*   A `shardFactor` change **takes effect only at the next window boundary**; the in-force value is pinned in the window's config snapshot and recorded on each applied counter key (§3.2).
*   Readers always sum **`max(historicalShardFactor, currentShardFactor)`** buckets for any open window, so no bucket is ever orphaned mid-window.
*   Registry validation **rejects** a `shardFactor` change that would take effect mid-window unless it is an increase and the reader-side max rule is in force.
*   `shardFactor` is immutable for the lifetime of a window bucket; reversal uses the recorded value.

### 4.3 Per-Client Allowed-Dimensions Registry
Each client has its own versioned snapshot declaring its dimensions and sharding policy. Two representations:

*   **Present (single client):** a per-client file `config/clients/{clientId}.json`, read at startup — preserving the "config change = reviewed deploy" posture.
*   **Recommended for multi-client scale:** a **`clientConfigs` collection**, one versioned document per client, so onboarding is a data operation rather than a fleet redeploy.

The registry is keyed by **direction** at the top level, so each direction carries an entirely independent dimension set:

```json
{
  "clientId": "CLIENT_A",
  "configVersion": 9,
  "timezone": "Asia/Kolkata",
  "directions": {

    "OUTWARD": {
      "allowedDimensions": [
        { "code": "GLOBAL", "attributes": [], "hot": true, "shardFactor": 32,
          "windows": { "DAILY_CALENDAR": {}, "DAILY_ROLLING": {}, "MONTHLY": {} } },

        { "code": "CHANNEL", "attributes": ["channel"], "hot": true, "shardFactor": 16,
          "windows": { "DAILY_CALENDAR": {}, "MONTHLY": {} } },

        { "code": "UCIC", "attributes": ["ucic"], "hot": false,
          "windows": { "DAILY_CALENDAR": {},
                       "DAILY_ROLLING":  { "granularity": "HOUR" },
                       "MONTHLY": {} } },

        { "code": "ACCOUNT", "attributes": ["accountNumber"], "hot": false,
          "windows": { "DAILY_CALENDAR": {},
                       "DAILY_ROLLING":  { "granularity": "MINUTE" } } },

        { "code": "MCC", "attributes": ["mcc"], "hot": false,
          "windows": { "MONTHLY": {} } },

        { "code": "UCIC_CHANNEL", "attributes": ["ucic", "channel"], "hot": false,
          "windows": { "DAILY_CALENDAR": {} } },

        { "code": "ACCOUNT_TURNOVER", "attributes": ["accountNumber"], "hot": false,
          "directionScope": "COMBINED",
          "windows": { "DAILY_CALENDAR": {}, "MONTHLY": {} } }
      ]
    },

    "INWARD": {
      "allowedDimensions": [
        { "code": "GLOBAL", "attributes": [], "hot": true, "shardFactor": 32,
          "windows": { "DAILY_CALENDAR": {}, "MONTHLY": {} } },

        { "code": "UCIC", "attributes": ["ucic"], "hot": false,
          "windows": { "DAILY_CALENDAR": {}, "DAILY_ROLLING": { "granularity": "HOUR" } } },

        { "code": "BENEFICIARY_ACCOUNT", "attributes": ["beneficiaryAccountNumber"],
          "hot": false, "directionScope": "DIRECTION_ONLY",
          "windows": { "DAILY_CALENDAR": {}, "DAILY_ROLLING": { "granularity": "HOUR" } } },

        { "code": "REMITTER_IFSC", "attributes": ["remitterIfsc"], "hot": false,
          "directionScope": "DIRECTION_ONLY",
          "windows": { "DAILY_CALENDAR": {} } },

        { "code": "ACCOUNT_TURNOVER", "attributes": ["accountNumber"], "hot": false,
          "directionScope": "COMBINED",
          "windows": { "DAILY_CALENDAR": {}, "MONTHLY": {} } }
      ]
    }
  }
}
```

Note what this example demonstrates:
*   **`GLOBAL` and `UCIC` appear in both** with the same codes but **different declared windows and different thresholds** — same code, separate counters, independent policy. This is the "same dimension, differentiated" case.
*   **`CHANNEL`, `MCC`, `UCIC_CHANNEL` are outward-only**; **`BENEFICIARY_ACCOUNT` and `REMITTER_IFSC` are inward-only.** Neither direction is forced to carry the other's dimensions.
*   **`ACCOUNT_TURNOVER` is `COMBINED`** and declared identically in both — one shared counter that inward credits and outward debits both increment, expressing a total-throughput control that neither direction could enforce alone.

**Backward compatibility.** A config carrying a top-level `allowedDimensions` and no `directions` map is **normalised on load** to `{ "directions": { "OUTWARD": { "allowedDimensions": [...] } } }`. The current single-client, outward-only configuration therefore continues to work unchanged, and migrating it is a rewrite of the config document rather than of any counter data — provided the direction segment is in the key from day one (§4.2), which is the whole point of doing this now.

#### 4.3.1 Window declaration — why a map, not a `BOTH` enum
`windows` is a **map keyed by window type**, whose value is an (optionally empty) override object. `{}` means "enforce this window with dimension-level defaults". A dimension needing both daily windows lists both — as `GLOBAL` and `UCIC` do above.

A scalar field such as `"window": "CALENDAR" | "ROLLING" | "BOTH"` was considered and **rejected**:

*   **It does not extend.** There are four window types today (`PER_TXN`, `DAILY_CALENDAR`, `DAILY_ROLLING`, `MONTHLY`) and `BOTH` addresses only the two daily ones. Expressing "calendar + monthly" or "rolling + monthly" would require inventing further enum values (`CALENDAR_AND_MONTHLY`, `ALL`, …), which grows combinatorially with every window type ever added — reintroducing exactly the hardcoding this registry exists to avoid.
*   **It needs special-case parsing.** `BOTH` must be expanded by the engine into a set, so the engine carries a mapping from magic values to window sets. A map is already the set; there is nothing to expand and one code path to test.
*   **It cannot carry per-window settings.** Rolling `granularity` and per-window `shardFactor` (§4.3.3) attach naturally to a map entry and have nowhere to live on a scalar.
*   **It reads worse in review.** A risk reviewer approving a client's config should see the enforced windows enumerated literally, not decode an abbreviation.

A plain array (`"windows": ["DAILY_CALENDAR", "DAILY_ROLLING"]`) is an acceptable simpler form and is equivalent to a map of empty objects; the engine SHOULD accept it and normalise to the map. The map is the canonical persisted form so that per-window overrides never require a schema migration.

#### 4.3.2 Window activation timing — avoiding a cold-start under-count *(important)*
Activating a window mid-period is **fail-open** if handled naively: a `DAILY_ROLLING` window activated at 14:00 has no history, so it starts from zero and under-counts for up to 24 hours; a newly activated `MONTHLY` window under-counts for up to a month. During that warm-up the system would approve transactions that a fully-populated counter would have rejected.

Rules, mirroring the `shardFactor` discipline of §4.2.6:

*   **Activation takes effect at the next window boundary** for that window type (next midnight in the client's timezone for daily windows; next month start for monthly). Until then the window is `PENDING_ACTIVATION` and is not enforced.
*   Where a bank accepts the risk and needs immediate effect, a window MAY be activated as **`WARMING`**: it is enforced immediately, but every decision made while warming is flagged in the audit record (`windowState: "WARMING"`) so any resulting approval is explainable and reviewable. This is an explicit, per-activation opt-in — never the default.
*   **De-activation** takes effect immediately (removing enforcement is always safe in the fail-closed direction; it only relaxes). The counter documents are left to TTL out, and reversal skips them (§3.4).
*   Activation state and effective time are recorded in the config snapshot and in `limitsAudit` (§4.4).

#### 4.3.3 Per-window overrides
A window's override object may carry:

*   **`granularity`** (`DAILY_ROLLING` only): `HOUR` (default) or `MINUTE`, per §4.2.5. Minute granularity tightens rolling precision from ±1 hour to ±1 minute at the cost of ~1,440 sub-fields per document — appropriate for a tightly-controlled dimension such as `ACCOUNT`, wasteful for a broad one.
*   **`shardFactor`**: overrides the dimension-level value for that window only. Useful because window cost profiles differ even at identical write rates — a `MONTHLY` counter for a hot dimension stays hot for an entire month and accumulates far larger values than a daily one, and a sharded rolling counter must sum `shardFactor × bucket-count` fields, so it often warrants a *lower* shard factor than its calendar sibling.
*   Absent keys inherit the dimension-level `hot`/`shardFactor`.

Validation rejects a `granularity` on a non-rolling window, and any `shardFactor` change is subject to §4.2.6's boundary rule.
*   **Per-client, per-direction governance:** each direction's registry bounds *its own* counter cardinality, per-transaction check cost, `shardFactor` and enforced windows — reviewed and approved per client **and per direction**. Enabling `INWARD` is therefore a reviewable event with its own cost envelope, not an implicit inheritance of the outward policy. The per-transaction cost is now explicitly *dimensions × declared windows*, which is the number a reviewer should be signing off against the <100ms budget (§4.1).
*   **Snapshot consistency (fail-safe reload):** configs load as **immutable, versioned snapshots**, validated per direction (each enabled direction must include `GLOBAL` with a Per-Transaction limit; valid attributes; at least one declared window per dimension; `granularity` only on `DAILY_ROLLING`; sane `shardFactor` per §4.2.6; valid IANA timezone; **every `COMBINED` dimension declared identically in both directions** per §2.1.7) then **atomically swapped in-process per client**, covering all its directions in one swap so the two registries can never diverge in version. A mid-flight change cannot silently corrupt enforcement, and one client's change never affects another's loaded snapshot.
*   **Activation gate (now two-level):** a limit definition may exist for a `(clientId, dimensionCode)` not yet in the registry — inert until the code is added. Likewise a definition may exist for a `(clientId, dimensionCode, windowType)` whose **window is not declared** for that dimension — also inert until the window is declared. This preserves the deliberate split between "define the limit" (product/BA activity, via API) and "activate enforcement" (ops/config activity, under review), now at window granularity.

### 4.4 Configuration Management (CRUD APIs)
`clientId` is taken from the authenticated principal; the path carries it for clarity and routing. Limits live in `limits` with a mandatory `clientId`.

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/clients` | Onboard a client (`clients` record + initial `clientConfigs` snapshot). *(admin)* |
| `GET` | `/clients` · `/clients/:clientId` | List / read client registry entries. *(admin)* |
| `PATCH` | `/clients/:clientId` | Update status (e.g. `SUSPEND`), auth binding, or timezone. *(admin)* |
| `GET` | `/clients/:clientId/directions` | List directions and their enablement state. |
| `PATCH` | `/clients/:clientId/directions/:direction` | Enable or disable a direction (requires a valid registry for it — §2.1.8). |
| `GET`/`PUT` | `/clients/:clientId/directions/:direction/dimensions` | Read / replace that client-and-direction registry (validated, version-bumped). |
| `POST` | `/clients/:clientId/directions/:direction/limits` | Create a limit definition for that client and direction. |
| `GET` | `/clients/:clientId/limits?direction=` · `/limits/:id` | List/filter (optionally by direction) · retrieve one. |
| `PUT`/`PATCH` | `/clients/:clientId/limits/:id` | Update thresholds / effective dates. Direction is immutable after creation. |
| `DELETE` | `/clients/:clientId/limits/:id` | Deactivate/remove a limit definition. |

Each `limits` record: **`clientId`**, **`direction`**, `dimensionCode`, `scope`, `windowType`, `thresholdAmount`, `thresholdCount`, `currency` (fixed `INR`), `isActive`, `effectiveFrom`/`effectiveTo`, **`definitionVersion`**, `createdBy`, `updatedAt`. All queries and caches key on `clientId` first; a caller authenticated as Client A can never read or mutate Client B's definitions.

**Change auditability *(new)*:** every create/update/delete writes an immutable entry to a `limitsAudit` collection (who, when, before/after, `definitionVersion`). Rejections record the `definitionVersion` in force (§3.2), so any historical decision can be explained against the exact threshold applied — an RBI-audit expectation.

**Runtime gating rule *(revised in v7.0)*:** the validation and reversal engines only evaluate/decrement a `(direction, dimensionCode, windowType)` triple where **all three** hold: the direction is enabled for the client, the dimension is present in *that direction's* registry, and the window is declared for that dimension (§4.3.1). A `limits` record failing any test is stored but inert. A limit defined for a direction not yet enabled is therefore stored and inert — which is exactly how an INWARD policy is authored and reviewed **before** inward traffic is switched on.

**Inert-definition warning *(new)*:** because a definition can now be inert for two distinct reasons, `POST`/`PUT` on `/limits` MUST return a non-blocking warning in the response body when the submitted `(dimensionCode, windowType)` is not currently enforced — naming which gate is closed (dimension not registered, or window not declared for that dimension) and what config change would activate it. The write still succeeds; silently accepting a limit that will never fire is the failure mode this prevents. `GET /clients/:clientId/limits` similarly returns an `effective: true|false` flag per definition.

**Definition cache:** cached in-process keyed by `clientId`, refreshed on CRUD writes via a `configVersion`/`limitsVersion` bump polled by instances, or a change-stream watch filtered by `clientId`. Not read from MongoDB per transaction.

### 4.5 Scaling Across Clients
*   Per-client, per-direction hot counters are bounded by **that client's rate in that direction**, so sharding is sized per client and per direction. A `COMBINED` dimension is the exception and must be sized against the **sum** of both directions' rates (§4.2).
*   **Capacity for INWARD is additive, not free.** Enabling inward adds an independent counter set and an independent claim and audit write stream. The 1,000 RPS target must be restated at enablement as either a per-direction or a combined figure — an open item to confirm before inward sizing (§5).
*   Because every `_id` and query **leads with `clientId`**, MongoDB **cluster sharding on a `clientId`-prefixed shard key** distributes tenants across shards cleanly. This does not (and need not) solve a single client's hot `_id` — that remains application-level counter-sharding (§4.2.2).
*   Onboarding: create `clients` record → `clientConfigs` snapshot → initial `limits` → optionally provision physical isolation. No code change, no schema migration.

### 4.6 Read Preference & Write Concern *(new — closes a silent over-approval hole)*
*   **All counter reads and the rolling-window pipeline update MUST use read preference `primary`.** If counter reads drift to a secondary, replication lag yields stale totals and the system **over-approves** — a fail-open failure. This is mandatory, not advisory, and must be enforced in the driver configuration and asserted in code review.
*   **Read concern** `local` on the primary is sufficient; counter correctness derives from single-document atomicity, not snapshot isolation.
*   **Write concern:** counter increments use `w:1` on the hot path for latency; the **claim insert and status resolution use `w:"majority"`**, since `transactions` is the system of record and the reconciliation source (§3.5). This asymmetry is deliberate and revisitable — the trade-off is that a primary failover could lose a counter increment, which reconciliation repairs.
*   Reporting, exports and reconciliation reads MAY use secondaries; they are never on the enforcement path.

### 4.7 Audit Retention, Archival & Sizing *(new — largest operational gap in v4.0)*
At 1,000 RPS the `transactions` collection grows by roughly **86.4 million documents per day** (~2.6 billion/month). At an estimated 400–600 bytes per document plus indexes, that is on the order of **40–60 GB/day**. v4.0 specified no retention strategy; unmanaged, this collection alone determines the cluster's fate.

*   **Hot (online) tier:** retain a configurable **90 days** in the live `transactions` collection to serve idempotency lookups, reversals and operational queries. Idempotency only needs a window meaningfully longer than any consumer's retry horizon; reversal needs the settlement window.
*   **Archive tier:** roll older records to a cold store (separate archival cluster or object storage in a columnar format) with the same `(clientId, transactionId)` addressability. Retention follows the bank's **RBI/statutory record-retention obligation** (typically multi-year) — the exact term is a compliance input, to be confirmed with the bank's compliance function and recorded here before go-live.
*   **Collection sharding:** shard `transactions` on a `clientId`-prefixed key with a hashed or date component to avoid a monotonically increasing shard-key hotspot.
*   **Index discipline:** the compound `_id` `(clientId, transactionId)` serves idempotency for free. Every additional index costs ~86M entries/day — each one must be justified against a named query pattern.
*   **Sizing sign-off:** storage, IOPS and working-set projections at 1,000 RPS are a required pre-development deliverable, not a post-launch discovery.

### 4.8 Time, Timezone & Clock Skew *(new)*
*   Window boundaries (calendar day, month, hour bucket) are computed in the **client's configured IANA timezone** (`clients.timezone`, default `Asia/Kolkata`), not the server's — so tenants in different regions get correct resets. Storage remains UTC.
*   **Clock skew:** window buckets derive from each instance's clock, so skew at a boundary splits writes across adjacent buckets. All instances **MUST** run NTP with skew held under **±1 second**; skew beyond a configured tolerance raises an alert and the instance is drained.
*   Bucket boundary effects are inherently bounded by the ±1 hour rolling granularity (§4.2.5) and are immaterial for calendar/monthly windows given sub-second skew.

### 4.9 Availability, Degradation & DR Posture *(new)*
*   **Fail closed, always.** If MongoDB is unreachable, the config snapshot is unresolvable, or the mandatory Global Per-Transaction limit cannot be resolved, the service **rejects transactions** rather than allowing them. A velocity gate that fails open is worse than one that is down.
*   **No bypass mode.** There is no "allow-through" toggle for degraded operation; any such control would defeat the system's purpose and is explicitly out of scope.
*   **Replica set:** deployment requires a replica set with automatic failover; the driver retries writes (`retryWrites: true`) across a step-down. Increments lost to a failover are repaired by reconciliation (§3.5).
*   **RTO/RPO** targets and the DR topology (cross-AZ, cross-region) are to be confirmed with the bank's infrastructure standards and recorded here before go-live.

### 4.10 Data Protection & Compliance *(new)*
The `transactions` collection holds customer identifiers (UCIC) and account numbers at very high volume, making it a material data-protection asset.

*   **Encryption at rest** on all collections, and **TLS in transit** for all client and intra-cluster connections.
*   **Field-level encryption** (or tokenization) for account number and UCIC is to be assessed against the bank's PCI-DSS scope and DPDP Act obligations; the decision and rationale must be recorded before go-live.
*   **Access control:** least-privilege database roles; the application principal has no privileges over `clients`/`clientConfigs` beyond read. Administrative APIs (`/clients`) require a separate admin role from tenant APIs.
*   **Data-subject and residency obligations** under the DPDP Act are handled per client, aided by the `clientId` partitioning and physical-isolation option (§2.1.3).
*   **Log hygiene:** account numbers and UCIC are masked in application logs and traces; only the audit collection holds them in full.

### 4.11 Observability *(new)*
Minimum metrics, per client and per dimension/window:
*   Decision counters: approvals, rejections **by breached dimension/window/metric**, `409` in-progress, `500`s.
*   **Compensation-failure rate** and **counter drift** from reconciliation (§3.5) — the two leading indicators of silent enforcement corruption.
*   `WriteConflict` rate and retry exhaustion per counter tier — the early warning that a `shardFactor` is undersized.
*   Latency p50/p95/p99 **per tier** (Tier 0/1/2, rolling pipeline) plus end-to-end.
*   Stale-`PENDING` reaper volume; TTL backlog; replication lag (breaching lag on the primary path is an alertable event given §4.6).
*   Alerting thresholds and on-call runbooks are a pre-go-live deliverable.

---

## 5. Assumptions & Constraints
*   **Direction scoping:** every registry, limit definition, counter and audit record is scoped to `(clientId, direction)`. Direction is an explicit, mandatory, validated request field — never defaulted, never inferred from the principal — and a request for a direction not enabled for that client fails closed. `COMBINED` dimensions are the single deliberate exception, sharing one counter across directions under the `ALL` key segment.
*   **Direction-set independence:** each direction carries its own dimension registry, thresholds, windows and sharding policy. The same `dimensionCode` may exist in both directions with entirely separate counters and policy; only a `COMBINED` declaration shares state, and it must be declared identically in both.
*   **Tenant isolation:** `clientId` derives from the authenticated principal and leads every key, index and query. A tenant cannot read, increment or reverse another's data. Unknown/inactive client → **fail closed**.
*   **Per-client independence:** dimensions, thresholds, sharding policy, timezone and config version are independent per client.
*   **Undefined limits:** no configured limit ⇒ "Unlimited" (and no counter maintained) — **except** the client's Global Per-Transaction limit, which is mandatory.
*   **Undeclared windows:** a window not declared for a dimension is never evaluated, counted or written, and any limit definition for it is inert (§4.3.1). Enforcement requires **both** a declared dimension/window **and** a limit definition.
*   **Window activation is boundary-aligned:** newly declared windows take effect at the next window boundary, or immediately under an explicit `WARMING` opt-in with every affected decision flagged in the audit (§4.3.2). De-activation is immediate.
*   **`PER_TXN` is implicit:** stateless, never declared, never gated, and cannot be de-activated by a registry edit — protecting the mandatory Global Per-Transaction cap.
*   **Mandatory Global Per-Transaction limit (per active client, per enabled direction):** every enabled direction of every `ACTIVE` client must include `GLOBAL` with a configured Per-Transaction limit. Missing at validation, enablement or lookup ⇒ fail closed. Tier 0, exact.
*   **Enforcement strictness tiers:**
    *   *Tier 0 (Per-Transaction):* exact, hard.
    *   *Tier 1 (high-cardinality per-entity aggregates — UCIC, ACCOUNT, composites), including the rolling window (§4.2.5):* **strict, single-document atomic** — the customer-protecting limits are hard.
    *   *Tier 2 (hot low-cardinality aggregates — GLOBAL, CHANNEL, and any sharded rolling counter):* **soft/approximate** with a small bounded overshoot, by design, in exchange for 1,000-RPS write scalability on a single logical counter.
*   **Atomicity:** no cross-document atomic script; all-or-nothing across a client's dimensions is approximated by a compensating saga (§3.3), backstopped by reconciliation (§3.5). Error direction is always conservative (toward rejection).
*   **Idempotency is a mutex, not a receipt:** the `PENDING` claim precedes all counter access (§3.1); concurrent duplicates receive `409` and never reach the counter path.
*   **Platform:** MongoDB **5.0+** (required for pipeline updates, §4.2.5), replica set, read preference `primary` on the enforcement path (§4.6).
*   **Money:** integers in minor units (paise); no floating point (§2.3.2). INR only in this release.
*   **Thresholds are inclusive maxima** (§2.3.1); mid-window threshold changes do not re-base accumulated velocity (§2.3.3).
*   **Scope:** pre-authorization limit gate only; the IMPS transfer runs downstream. Reversal (§3.4) reconciles state with downstream outcomes.
*   **Open items for confirmation before go-live:** statutory retention term (§4.7), field-level encryption decision (§4.10), RTO/RPO and DR topology (§4.9), alert thresholds (§4.11).
*   **Open items for confirmation before INWARD enablement:** whether the 1,000 RPS target is per direction or combined (§4.5); the inward dimension set and the source of its attributes; whether the risk function requires any `COMBINED` total-throughput control and its sizing (§2.1.7, §4.2); the withdrawal date for the reversal-API direction default (§3.1).

## 6. Acceptance Criteria (UAT)
*   **UAT 1:** Reject a transaction exceeding the rolling 24-hour limit even if the calendar day reset.
*   **UAT 2:** Record the correct breached dimension, threshold, `definitionVersion` and current velocity for every rejection (with `clientId`).
*   **UAT 3:** Simulate a status-resolution failure after counter increments; verify all applied increments are compensated and `500` returned.
*   **UAT 4:** Verify internal retry handles transient blips (incl. `WriteConflict`) without a `500`.
*   **UAT 5:** Hold the 500ms–700ms SLA under a sustained **1,000 RPS** for the single client.
*   **UAT 6:** Reject once Monthly is exceeded at any dimension even when Daily and Per-Transaction pass.
*   **UAT 7:** Independently enforce Daily and Monthly at each configured dimension.
*   **UAT 8:** Submit the same `(clientId, transactionId)` twice sequentially; the second returns the stored result without re-validation.
*   **UAT 9:** Reverse an `APPROVED` transaction; verify the exact recorded counter documents (incl. the specific sharded bucket) are decremented and status becomes `REVERSED`.
*   **UAT 10:** Reverse twice; the second call is a no-op, with no double decrement.
*   **UAT 11:** CRUD on `/clients/:clientId/limits` takes effect on subsequent transactions without a restart.
*   **UAT 12:** Reject once the Global Per-Transaction limit is exceeded; cannot be bypassed.
*   **UAT 13:** Fail closed if a client's Global Per-Transaction limit is missing.
*   **UAT 14:** Add a new composite dimension + limit to a client's registry; enforced next transaction, no code change.
*   **UAT 15:** Create a limit for a `dimensionCode` **not** in the client's registry; no effect until added.
*   **UAT 16:** A scope-override limit takes precedence over the client's dimension default.
*   **UAT 17:** Remove a dimension after an approval under it; a later reversal skips the ungoverned key without erroring.
*   **UAT 18:** Configure both `thresholdAmount` and `thresholdCount`; reject on breaching either alone.
*   **UAT 19:** Drive **1,000 increments/second at one client's single logical GLOBAL counter**; verify load spreads across `shardFactor` buckets, `WriteConflict` retries stay within budget, p99 internal latency `< 100ms`.
*   **UAT 20:** After a known number of approvals against a sharded GLOBAL counter, verify the summed total matches and reversals reduce it correctly.
*   **UAT 21:** Verify TTL auto-removes calendar-day and monthly counter documents after their window, and that rolling-window documents self-prune expired sub-buckets.
*   **UAT 22:** Under hot-dimension concurrency, verify Tier-2 overshoot stays within the documented bound and Tier-1 error direction is toward rejection.
*   **UAT 23:** Tenant isolation — identical `dimensionCode`s and Transaction IDs across two clients remain fully independent in counters, limits and audit.
*   **UAT 24:** Cross-tenant access denial — authenticated as Client A, attempts against Client B's limits or transactions are rejected with no leakage or mutation.
*   **UAT 25:** Per-client dimensions — two clients with different registries each enforce only their own.
*   **UAT 26:** Unknown and `SUSPENDED` clients fail closed before any counter access.
*   **UAT 27:** A payload `clientId` differing from the authenticated principal is rejected.
*   **UAT 28:** Onboard a new client via the admin APIs; enforced without code change or fleet restart, existing clients unaffected.
*   **UAT 29:** *(New — breach is not an error, §4.2.1.)* Drive a Tier-1 counter past its threshold; verify the breach returns a clean rejection on the **first** attempt, with **no `E11000`**, no retry backoff consumed, and the rejection latency indistinguishable from an approval.
*   **UAT 30:** *(New — concurrent duplicate race, §3.1.)* Fire N concurrent requests with the **identical** `(clientId, transactionId)`. Verify exactly one runs the waterfall, counters are incremented **exactly once** in total, losers receive `409`/stored status, and the final counter value matches a single transaction.
*   **UAT 31:** *(New — strict rolling enforcement, §4.2.5.)* Fire concurrent transactions against one entity's rolling limit sized so only K can fit. Verify **exactly K** are approved and the rest rejected, with **no overshoot** — the check-and-increment is atomic.
*   **UAT 32:** *(New — rolling self-prune.)* Age a rolling document past 24h; verify expired sub-buckets are removed by the next update, the document stays bounded to ~25 buckets, and the total reflects only the live window.
*   **UAT 33:** *(New — threshold boundary, §2.3.1.)* A transaction landing **exactly on** the threshold is approved; the next paisa/count over is rejected. Verified for amount and count independently.
*   **UAT 34:** *(New — shardFactor change, §4.2.6.)* Lower `shardFactor` mid-window; verify no bucket is orphaned, the summed total does not drop, and no over-approval occurs. Verify the change applies only at the next window boundary.
*   **UAT 35:** *(New — stale claim reaper, §3.1.1.)* Kill an instance mid-waterfall; verify the orphaned `PENDING` is reaped to `ABANDONED` within the configured window, a fresh retry of that Transaction ID is then accepted, and reconciliation repairs any orphaned increments.
*   **UAT 36:** *(New — reconciliation, §3.5.)* Inject counter drift (a failed compensation); verify the sweeper detects it, alerts, and corrects the closed-window counter to the value derived from `transactions`.
*   **UAT 37:** *(New — read preference, §4.6.)* With induced replication lag, verify counter reads are served by the primary and no stale-read over-approval occurs.
*   **UAT 38:** *(New — fail-closed DR, §4.9.)* Make MongoDB unreachable; verify transactions are **rejected**, never allowed through, and that recovery restores normal enforcement without manual counter repair beyond reconciliation.
*   **UAT 39:** *(New — threshold change mid-window, §2.3.3.)* Lower a threshold below a customer's already-consumed velocity; verify subsequent transactions in that window are rejected and the audit records the new `definitionVersion`.
*   **UAT 40:** *(New — client timezone, §4.8.)* For a client in a non-server timezone, verify calendar-day and monthly windows reset at midnight **in the client's timezone**.
*   **UAT 41:** *(New — window declaration, §4.3.1.)* For a dimension declaring only `DAILY_CALENDAR`, create a `DAILY_ROLLING` limit definition; verify it is stored, reported `effective: false` with a warning, **no rolling counter document is created**, no rolling write occurs, and enforcement ignores it entirely. Then declare the rolling window and verify it becomes effective.
*   **UAT 42:** *(New — both daily windows, §2.3.)* For a dimension declaring **both** daily windows with different thresholds, verify a transaction is rejected on breaching **either** independently, and that a dimension declaring only one daily window enforces that one alone without error.
*   **UAT 43:** *(New — activation timing, §4.3.2.)* Declare a new `MONTHLY` window mid-month; verify it is `PENDING_ACTIVATION` and unenforced until the next month boundary. Separately activate a window as `WARMING`; verify it enforces immediately and every decision taken while warming carries `windowState: "WARMING"` in the audit record.
*   **UAT 44:** *(New — window de-activation & reversal, §3.4.)* Approve a transaction under a dimension/window, then de-activate that window; verify enforcement stops immediately, a subsequent reversal **skips** the now-ungoverned counter without erroring, and counters for other declared windows of the same dimension are still decremented correctly.
*   **UAT 45:** *(New — direction scoping, §2.1.5, §4.2.)* Submit an outward and an inward transaction for the same client, same dimension code and same attribute values; verify they increment **separate** counter documents, neither affects the other's velocity, and each is evaluated against its own direction's thresholds.
*   **UAT 46:** *(New — divergent dimension sets, §2.1.7, §4.3.)* Configure a dimension present only in the outward registry and another only in the inward registry; verify each direction evaluates only its own dimensions and neither errors on the other's absence.
*   **UAT 47:** *(New — combined scope, §2.1.7.)* Declare a `COMBINED` dimension identically in both directions; verify outward and inward transactions increment the **same** shared counter, the combined total triggers rejection in either direction, and a reversal decrements the shared key correctly.
*   **UAT 48:** *(New — asymmetric combined rejected, §2.1.7.)* Submit a config declaring a `COMBINED` dimension with different attributes or windows across the two directions; verify registry validation rejects it and the previously loaded snapshot stays in force.
*   **UAT 49:** *(New — direction fail-closed, §2.1.6.)* Submit transactions with a missing direction, an unrecognised direction, and a valid direction not enabled for that client; verify all three are rejected before any counter access and that a missing direction is never defaulted.
*   **UAT 50:** *(New — cross-direction identifier collision, §3.1.)* Submit an outward and an inward transaction carrying the **identical** Transaction ID for the same client; verify both are processed independently and neither resolves to the other's stored decision.
*   **UAT 51:** *(New — inert inward policy, §4.4.)* With `INWARD` not enabled, create a full inward registry and inward limit definitions; verify they are stored, reported not effective, have no effect on outward traffic, and become enforced on enablement with no code change.
*   **UAT 52:** *(New — backward compatibility, §4.3.)* Load a legacy config with a top-level `allowedDimensions` and no `directions` map; verify it normalises to an outward-only registry and existing outward enforcement is unchanged.
