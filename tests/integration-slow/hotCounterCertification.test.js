import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb, createApp } from '../integration/helpers/setup.js';
import { validateAndNormalizeRegistry, buildRegistryDocument, CLIENT_CONFIGS_COLLECTION } from '../../src/models/registry.model.js';
import { buildLimitDefinitionDocument, validateLimitDefinitionCreate, LIMITS_COLLECTION } from '../../src/models/limitDefinition.model.js';
import { TRANSACTIONS_COLLECTION } from '../../src/models/transaction.model.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';

const TZ = 'UTC';

function warming(windows) {
  const out = {};
  for (const [type, override] of Object.entries(windows)) {
    out[type] = { ...override, warming: true };
  }
  return out;
}

async function seedHotClient(db, clientId, shardFactor, thresholdCount) {
  const now = new Date();
  const dimensions = [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor, windows: warming({ DAILY_CALENDAR: {} }) }];
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone: TZ, now });
  const registryDoc = buildRegistryDocument({ clientId, allowedDimensions: normalized, configVersion: 1, limitsVersion: 1, actor: 'hot-cert', now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).insertOne(registryDoc);

  await db.collection(LIMITS_COLLECTION).insertOne({
    ...buildLimitDefinitionDocument({
      clientId,
      normalized: validateLimitDefinitionCreate({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 10_000_000 }),
      actor: 'hot-cert',
      now,
    }),
    clientId,
  });
  await db.collection(LIMITS_COLLECTION).insertOne({
    ...buildLimitDefinitionDocument({
      clientId,
      // Count-capped, not amount-capped — makes "how many were approved beyond K" a direct overshoot count.
      normalized: validateLimitDefinitionCreate({ dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 10_000_000, thresholdCount }),
      actor: 'hot-cert',
      now,
    }),
    clientId,
  });
}

async function runWithConcurrency(count, concurrency, worker) {
  let cursor = 0;
  const results = new Array(count);
  async function runner() {
    while (cursor < count) {
      const i = cursor;
      cursor += 1;
      // eslint-disable-next-line no-await-in-loop
      results[i] = await worker(i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

function percentile(sortedMs, p) {
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

function parseCounterMetric(expositionText, metricName, labelFilter) {
  const lines = expositionText.split('\n').filter((line) => line.startsWith(metricName + '{'));
  let total = 0;
  for (const line of lines) {
    if (labelFilter && !line.includes(labelFilter)) continue;
    const value = Number(line.trim().split(' ').pop());
    total += value;
  }
  return total;
}

/**
 * BRD §4.1/§4.2.2/§4.2.4, STORY-07-02 — "prove the central engineering claim of this design: that
 * a single logical counter can absorb the full request rate because it is split across shard
 * buckets, and that the resulting approximation stays inside its documented bound." This drives
 * real concurrency at a single logical GLOBAL counter and records the actually-measured figures —
 * overshoot, per-shard write distribution, retry rate, and p99 latency under contention — rather
 * than asserting the BRD's own claims as givens.
 */
describe('Hot counter concurrency certification — STORY-07-02 (integration-slow, real MongoDB)', () => {
  let client;
  let db;

  before(async () => {
    ({ client, db } = await connectTestDb('hot_counter_certification'));
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  async function driveConcurrentApprovals(app, clientId, count, concurrency) {
    const transactionService = app.locals.services.transactionService;
    const samplesMs = [];
    let approved = 0;
    await runWithConcurrency(count, concurrency, async (i) => {
      const t0 = process.hrtime.bigint();
      const res = await transactionService.submit(clientId, { transactionId: `HOT-${clientId}-${i}`, amount: 10 }, TZ);
      samplesMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
      if (res.body?.data?.status === 'APPROVED') approved += 1;
    });
    return { samplesMs, approved };
  }

  /**
   * `count`/`thresholdCount` are deliberately sized so the run spans MANY of Tier 2's 200ms
   * cache-refresh windows (STORY-03-04's `HotCounterCache`), not just one. A run that completes
   * entirely inside a single refresh window sees every request check the same never-refreshed
   * cached total and can overshoot the cap almost completely — a real characteristic of the design,
   * but not a stable or representative measurement of "how much does this normally overshoot."
   * With a threshold well above what one refresh window's worth of concurrent requests could ever
   * approve, overshoot is bounded by roughly one window's excess near the boundary, regardless of
   * how large the threshold is — which is exactly why it shrinks as a PERCENTAGE for a realistic,
   * much-larger production threshold even though the absolute excess stays roughly constant.
   */
  async function certifyShardFactor(shardFactor, { count = 3000, concurrency = 25, thresholdCount = 2000 } = {}) {
    const clientId = `CLIENT_HOT_SF${shardFactor}`;
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({ clientId });
    await db.collection(COUNTERS_COLLECTION).deleteMany({ clientId });
    await db.collection(CLIENT_CONFIGS_COLLECTION).deleteMany({ _id: clientId });
    await db.collection(LIMITS_COLLECTION).deleteMany({ clientId });
    await seedHotClient(db, clientId, shardFactor, thresholdCount);

    const app = createApp(db);
    await app.locals.configCache.warm([clientId]);

    const { samplesMs, approved } = await driveConcurrentApprovals(app, clientId, count, concurrency);

    const sorted = [...samplesMs].sort((a, b) => a - b);
    const p99 = percentile(sorted, 99);
    const overshoot = Math.max(0, approved - thresholdCount);

    const shardDocs = await db.collection(COUNTERS_COLLECTION).find({ clientId, buckets: { $exists: false } }).toArray();
    const shardCounts = shardDocs.map((d) => d.count ?? 0);
    const maxShardCount = Math.max(0, ...shardCounts);
    const totalCount = shardCounts.reduce((a, b) => a + b, 0);

    const exposition = await app.locals.metricsService.exposition();
    const retryAttempts = parseCounterMetric(exposition, 'imps_counter_retry_attempts_total', 'tier="tier2"');
    const retryExhausted = parseCounterMetric(exposition, 'imps_counter_retry_exhausted_total', 'tier="tier2"');

    const report = {
      shardFactor,
      requested: count,
      approved,
      thresholdCount,
      overshoot,
      overshootPct: ((overshoot / thresholdCount) * 100).toFixed(1),
      shardDocCount: shardDocs.length,
      maxShardCount,
      totalCount,
      maxShardShareOfTotal: totalCount > 0 ? ((maxShardCount / totalCount) * 100).toFixed(1) : '0.0',
      retryAttempts,
      retryExhausted,
      p99LatencyMs: p99.toFixed(1),
    };
    // eslint-disable-next-line no-console
    console.log(`[hot-counter-cert] shardFactor=${shardFactor}: ${JSON.stringify(report)}`);
    return report;
  }

  test(
    'AC1/AC2/AC3/UAT 19/UAT 22: overshoot stays within a small documented bound, writes spread across shard buckets, and p99 latency holds under contention',
    async () => {
      const report = await certifyShardFactor(8, { count: 3000, concurrency: 25, thresholdCount: 2000 });

      assert.ok(report.shardDocCount > 1, 'load must actually spread across more than one physical shard document, not collapse to one');
      assert.ok(report.shardDocCount <= 8, 'no more than shardFactor distinct shard documents should ever exist for one window');
      // BRD §4.2.4 — "never by writing one physical document 1,000×/second." No single shard should
      // absorb an outsized share of the total; with 8 shards, an even split is ~12.5% each — this
      // allows real skew from random shard selection while still catching a collapse-to-one-document failure.
      assert.ok(Number(report.maxShardShareOfTotal) < 50, `a single shard document absorbed ${report.maxShardShareOfTotal}% of all writes — the sharding is not spreading load`);
      // Tier 2's documented "small bounded overshoot" (BRD §4.2.2/§5) — generous enough to allow
      // real concurrency-driven overshoot while still catching an unbounded blow-past-the-cap failure.
      assert.ok(Number(report.overshootPct) < 50, `measured overshoot ${report.overshootPct}% of threshold exceeds a sane bound`);
      assert.ok(Number(report.p99LatencyMs) < 250, `p99 latency under contention (${report.p99LatencyMs}ms) is unexpectedly high`);
    },
    { timeout: 60_000 },
  );

  test(
    'AC4: shardFactor tuning — comparing a low and a high shard factor under the identical workload produces a real, measured justification',
    async () => {
      const low = await certifyShardFactor(2, { count: 3000, concurrency: 25, thresholdCount: 2000 });
      const high = await certifyShardFactor(16, { count: 3000, concurrency: 25, thresholdCount: 2000 });

      // eslint-disable-next-line no-console
      console.log(`[hot-counter-cert] tuning comparison: shardFactor=2 -> maxShardShare=${low.maxShardShareOfTotal}%, shardFactor=16 -> maxShardShare=${high.maxShardShareOfTotal}%`);

      // The measured, not assumed, effect: more shards spread writes thinner per document.
      assert.ok(
        Number(high.maxShardShareOfTotal) <= Number(low.maxShardShareOfTotal),
        `a higher shardFactor (16) should spread load at least as thinly per document as a lower one (2); got low=${low.maxShardShareOfTotal}% high=${high.maxShardShareOfTotal}%`,
      );
    },
    { timeout: 60_000 },
  );
});
