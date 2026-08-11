import { findApplicableDefinition } from '../models/limitDefinition.model.js';
import { buildCounterKey, buildRollingKey, resolveWindowBucket } from '../models/counter.model.js';
import { buildRollingPipeline, buildShardedRollingPipeline } from '../models/rollingCounter.model.js';
import { resolveShardFactorForRead, resolveShardFactorForWrite } from '../models/registry.model.js';
import { rollingBucketLabel, rollingHorizonLabel, rollingExpireAtFor } from '../utils/windowBoundary.js';
import { withTransientRetry } from '../utils/retry.js';
import { GLOBAL_DIMENSION_CODE, PER_TXN_WINDOW_TYPE } from '../constants/index.js';

const DEFAULT_HOT_CACHE_REFRESH_MS = 200;

/**
 * BRD §4.2.3 — "Each service instance caches hot-counter totals... with a
 * short refresh interval (100–250ms)." Lazy/read-through rather than a
 * background poll: staleness is bounded at the point of use (every read
 * either serves a value refreshed within the interval or refreshes first),
 * which meets the same guarantee (STORY-03-04 AC5) without polling keys
 * nobody is currently checking.
 */
class HotCounterCache {
  constructor(counterRepository, { refreshIntervalMs = DEFAULT_HOT_CACHE_REFRESH_MS } = {}) {
    this.counterRepository = counterRepository;
    this.refreshIntervalMs = refreshIntervalMs;
    this.entries = new Map();
  }

  async getTotal(clientId, baseKey, shardKeys) {
    const cached = this.entries.get(baseKey);
    const now = Date.now();
    if (cached && now - cached.refreshedAt < this.refreshIntervalMs) {
      return cached.total;
    }
    const total = await this.counterRepository.sumKeys(clientId, shardKeys);
    this.entries.set(baseKey, { total, refreshedAt: now });
    return total;
  }

  async getRollingTotal(clientId, baseKey, shardKeys, oldestValidBucketLabel) {
    const cached = this.entries.get(baseKey);
    const now = Date.now();
    if (cached && now - cached.refreshedAt < this.refreshIntervalMs) {
      return cached.total;
    }
    const total = await this.counterRepository.sumRollingKeys(clientId, shardKeys, oldestValidBucketLabel);
    this.entries.set(baseKey, { total, refreshedAt: now });
    return total;
  }
}

function buildGuardFilter({ thresholdAmount, thresholdCount, amountDelta, countDelta }) {
  const guardFilter = {};
  if (thresholdAmount !== undefined && thresholdAmount !== null) {
    guardFilter.amount = { $lte: thresholdAmount - amountDelta };
  }
  if (thresholdCount !== undefined && thresholdCount !== null) {
    guardFilter.count = { $lte: thresholdCount - countDelta };
  }
  return guardFilter;
}

function breachedMetrics({ current, thresholdAmount, thresholdCount, amountDelta, countDelta }) {
  const metrics = [];
  if (thresholdAmount !== undefined && thresholdAmount !== null && current.amount + amountDelta > thresholdAmount) {
    metrics.push('AMOUNT');
  }
  if (thresholdCount !== undefined && thresholdCount !== null && current.count + countDelta > thresholdCount) {
    metrics.push('COUNT');
  }
  return metrics;
}

/**
 * BRD §4.2.0 / STORY-03-02 — Tier 0. Stateless: no counter document, no
 * read, no write, no cardinality. Operates purely on the in-process
 * definitions cache (STORY-02-06), so it costs nothing even at 1,000 RPS.
 *
 * BRD §5 "Mandatory Global Per-Transaction limit... Missing at validation,
 * enablement or lookup ⇒ fail closed." — a missing definition is a
 * rejection, never treated as "unlimited". This is what makes the cap
 * impossible to bypass by omission.
 */
export class CounterEngineService {
  constructor(counterRepository, configCache, options = {}) {
    this.counterRepository = counterRepository;
    this.configCache = configCache;
    this.hotCounterCache = new HotCounterCache(counterRepository, options.hotCache);
  }

  checkPerTransaction(clientId, txnAmount, now = new Date()) {
    const definitions = this.configCache.getDefinitions(clientId) ?? [];
    const definition = findApplicableDefinition(definitions, GLOBAL_DIMENSION_CODE, PER_TXN_WINDOW_TYPE, {}, now);

    if (!definition) {
      return {
        passed: false,
        failClosed: true,
        reason: 'GLOBAL_PER_TXN_MISSING',
        message: `Client '${clientId}' has no configured Global Per-Transaction limit; failing closed (BRD §5).`,
      };
    }

    // §2.3.1 — inclusive maxima: permit iff txnAmount <= thresholdAmount.
    const passed = txnAmount <= definition.thresholdAmount;
    return {
      passed,
      failClosed: false,
      definitionVersion: definition.definitionVersion,
      breach: passed ? null : { metric: 'AMOUNT', threshold: definition.thresholdAmount, actual: txnAmount },
    };
  }

  /**
   * BRD §4.2.1 / STORY-03-03 — Tier 1: bootstrap, then the guarded
   * check-and-increment. `matchedCount === 0` is a clean, immediate,
   * never-retried breach (the v4 defect this story fixes); it is a
   * returned outcome, not a thrown error, so `withTransientRetry` never
   * sees it and consumes no backoff on the breach path (AC3).
   */
  async checkAndIncrementTier1(clientId, { dimensionCode, windowType, attributeValues, timezone, txnAmount, thresholdAmount, thresholdCount, now = new Date() }) {
    const { windowBucket, expireAt } = resolveWindowBucket(windowType, timezone, now);
    const key = buildCounterKey({ clientId, dimensionCode, windowType, attributeValues, windowBucket });
    const amountDelta = txnAmount;
    const countDelta = 1;

    await withTransientRetry(() => this.counterRepository.bootstrap(clientId, key, { clientId, amount: 0, count: 0, createdAt: now, updatedAt: now, expireAt }));

    const guardFilter = buildGuardFilter({ thresholdAmount, thresholdCount, amountDelta, countDelta });
    const result = await withTransientRetry(() =>
      this.counterRepository.guardedIncrement(clientId, key, { guardFilter, amountDelta, countDelta, now }),
    );

    if (result.matchedCount === 1) {
      return { passed: true, appliedKey: key, amountDelta, countDelta };
    }

    const current = (await this.counterRepository.findByKey(clientId, key)) ?? { amount: 0, count: 0 };
    return {
      passed: false,
      appliedKey: null,
      breach: {
        metrics: breachedMetrics({ current, thresholdAmount, thresholdCount, amountDelta, countDelta }),
        currentAmount: current.amount,
        currentCount: current.count,
        thresholdAmount,
        thresholdCount,
      },
    };
  }

  /**
   * BRD §3.3 step 3 / §3.4 — compensates (or reverses) an applied Tier 1
   * increment, or decrements a specific Tier 2 shard bucket at reversal
   * (same document shape, same floor-guard rule — §3.4's "decrement the
   * exact counter documents recorded at approval... for a sharded counter,
   * decrement the recorded bucket"). Floor-guarded: never drives a counter
   * negative.
   */
  async compensateTier1(clientId, appliedKey, { amountDelta, countDelta, now = new Date() }) {
    const result = await withTransientRetry(() => this.counterRepository.guardedDecrement(clientId, appliedKey, { amountDelta, countDelta, now }));
    return { floorGuardHeld: result.matchedCount === 1 };
  }

  /**
   * BRD §4.2.2 / STORY-03-04 — Tier 2: soft/approximate, bounded overshoot
   * by design. The cached total is checked first (fast path); the
   * increment itself is unconditional, so concurrent requests that all
   * observe a passing cached total before any of their increments land can
   * collectively overshoot by up to that many in-flight requests — the
   * documented, accepted trade-off for 1,000-RPS write scalability on one
   * logical counter (BRD §4.2.2 "Enforcement semantics").
   *
   * `windowEntry` is the registry's window config for this dimension/window
   * (carries `shardFactorHistory`, STORY-03-05) — shard factor resolution
   * lives here, not in the caller, so it is computed the same way on every
   * call site.
   */
  async checkAndIncrementTier2(clientId, { dimensionCode, windowType, attributeValues, timezone, windowEntry, txnAmount, thresholdAmount, thresholdCount, now = new Date() }) {
    const { windowBucket, expireAt } = resolveWindowBucket(windowType, timezone, now);
    const baseKey = buildCounterKey({ clientId, dimensionCode, windowType, attributeValues, windowBucket });

    const shardFactorForRead = resolveShardFactorForRead(windowEntry, now);
    const shardFactorForWrite = resolveShardFactorForWrite(windowEntry, now);
    const readShardKeys = Array.from({ length: shardFactorForRead }, (_, i) => `${baseKey}#${i}`);

    const cachedTotal = await this.hotCounterCache.getTotal(clientId, baseKey, readShardKeys);
    const amountDelta = txnAmount;
    const countDelta = 1;

    const amountBreached = thresholdAmount !== undefined && thresholdAmount !== null && cachedTotal.amount + amountDelta > thresholdAmount;
    const countBreached = thresholdCount !== undefined && thresholdCount !== null && cachedTotal.count + countDelta > thresholdCount;

    if (amountBreached || countBreached) {
      return {
        passed: false,
        soft: true,
        breach: {
          metrics: [...(amountBreached ? ['AMOUNT'] : []), ...(countBreached ? ['COUNT'] : [])],
          currentAmount: cachedTotal.amount,
          currentCount: cachedTotal.count,
          thresholdAmount,
          thresholdCount,
        },
      };
    }

    const shardIndex = Math.floor(Math.random() * shardFactorForWrite);
    const shardKey = `${baseKey}#${shardIndex}`;
    await withTransientRetry(() => this.counterRepository.incrementShardUnconditional(clientId, shardKey, { amountDelta, countDelta, now, expireAt }));

    return { passed: true, soft: true, appliedKey: shardKey, shardIndex, shardFactorUsed: shardFactorForWrite, amountDelta, countDelta };
  }

  /** BRD §4.2.2 "logical total = sum of that client's buckets" — a direct (uncached) read, for callers that need the exact current total rather than the bounded-staleness cached one (e.g. audit, reconciliation). */
  async readTier2Total(clientId, { dimensionCode, windowType, attributeValues, timezone, windowEntry, now = new Date() }) {
    const { windowBucket } = resolveWindowBucket(windowType, timezone, now);
    const baseKey = buildCounterKey({ clientId, dimensionCode, windowType, attributeValues, windowBucket });
    const shardFactorForRead = resolveShardFactorForRead(windowEntry, now);
    const readShardKeys = Array.from({ length: shardFactorForRead }, (_, i) => `${baseKey}#${i}`);
    return this.counterRepository.sumKeys(clientId, readShardKeys);
  }

  /**
   * BRD §4.2.5 / STORY-03-06 — Tier 1 rolling: the single-document,
   * atomic, strictly-enforced 24h sliding window. `_applied` and the
   * pruned/merged `buckets` come back from the SAME round trip — no
   * second read is needed for the audit (AC3).
   */
  async checkAndIncrementRolling(clientId, { dimensionCode, attributeValues, txnAmount, thresholdAmount, thresholdCount, granularity = 'HOUR', now = new Date() }) {
    const key = buildRollingKey({ clientId, dimensionCode, attributeValues });
    const currentBucketLabel = rollingBucketLabel(now, granularity);
    const oldestValidBucketLabel = rollingHorizonLabel(now, granularity);
    const amountDelta = txnAmount;
    const countDelta = 1;

    const pipeline = buildRollingPipeline({
      oldestValidBucketLabel,
      currentBucketLabel,
      amountDelta,
      countDelta,
      thresholdAmount,
      thresholdCount,
      clientId,
      now,
      expireAt: rollingExpireAtFor(now),
    });

    const updated = await withTransientRetry(() => this.counterRepository.rollingPipelineUpdate(clientId, key, pipeline));

    if (updated._applied) {
      return { passed: true, appliedKey: key, bucketLabel: currentBucketLabel, amountDelta, countDelta };
    }
    return {
      passed: false,
      appliedKey: null,
      breach: { currentAmount: updated._sumA, currentCount: updated._sumC, thresholdAmount, thresholdCount },
    };
  }

  /** BRD §3.4 — reverses one rolling sub-bucket. A pruned or already-drained bucket reports `floorGuardHeld:false`, the same drift signal a Tier 1 floor-guard failure produces. */
  async compensateRolling(clientId, appliedKey, { bucketLabel, amountDelta, countDelta, now = new Date() }) {
    const result = await withTransientRetry(() =>
      this.counterRepository.decrementRollingBucket(clientId, appliedKey, { bucketLabel, amountDelta, countDelta, now }),
    );
    return { floorGuardHeld: result.matchedCount === 1 };
  }

  /** BRD §4.2.5 "hot dimensions... reverts to Tier-2 soft semantics" — sharded rolling: unconditional per-shard bucket update, still self-pruning. */
  async checkAndIncrementRollingSharded(clientId, { dimensionCode, attributeValues, windowEntry, txnAmount, thresholdAmount, thresholdCount, granularity = 'HOUR', now = new Date() }) {
    const baseKey = buildRollingKey({ clientId, dimensionCode, attributeValues });
    const currentBucketLabel = rollingBucketLabel(now, granularity);
    const oldestValidBucketLabel = rollingHorizonLabel(now, granularity);
    const amountDelta = txnAmount;
    const countDelta = 1;

    const shardFactorForRead = resolveShardFactorForRead(windowEntry, now);
    const shardFactorForWrite = resolveShardFactorForWrite(windowEntry, now);
    const readShardKeys = Array.from({ length: shardFactorForRead }, (_, i) => `${baseKey}#${i}`);

    const cachedTotal = await this.hotCounterCache.getRollingTotal(clientId, baseKey, readShardKeys, oldestValidBucketLabel);
    const amountBreached = thresholdAmount !== undefined && thresholdAmount !== null && cachedTotal.amount + amountDelta > thresholdAmount;
    const countBreached = thresholdCount !== undefined && thresholdCount !== null && cachedTotal.count + countDelta > thresholdCount;

    if (amountBreached || countBreached) {
      return {
        passed: false,
        soft: true,
        breach: {
          metrics: [...(amountBreached ? ['AMOUNT'] : []), ...(countBreached ? ['COUNT'] : [])],
          currentAmount: cachedTotal.amount,
          currentCount: cachedTotal.count,
          thresholdAmount,
          thresholdCount,
        },
      };
    }

    const shardIndex = Math.floor(Math.random() * shardFactorForWrite);
    const shardKey = `${baseKey}#${shardIndex}`;
    const pipeline = buildShardedRollingPipeline({
      oldestValidBucketLabel,
      currentBucketLabel,
      amountDelta,
      countDelta,
      clientId,
      now,
      expireAt: rollingExpireAtFor(now),
    });
    await withTransientRetry(() => this.counterRepository.rollingPipelineUpdate(clientId, shardKey, pipeline));

    return { passed: true, soft: true, appliedKey: shardKey, shardIndex, shardFactorUsed: shardFactorForWrite, amountDelta, countDelta };
  }

  /** Direct (uncached) read across every rolling shard, pruned to the live horizon — for audit/reconciliation. */
  async readRollingShardedTotal(clientId, { dimensionCode, attributeValues, windowEntry, granularity = 'HOUR', now = new Date() }) {
    const baseKey = buildRollingKey({ clientId, dimensionCode, attributeValues });
    const oldestValidBucketLabel = rollingHorizonLabel(now, granularity);
    const shardFactorForRead = resolveShardFactorForRead(windowEntry, now);
    const readShardKeys = Array.from({ length: shardFactorForRead }, (_, i) => `${baseKey}#${i}`);
    return this.counterRepository.sumRollingKeys(clientId, readShardKeys, oldestValidBucketLabel);
  }
}
