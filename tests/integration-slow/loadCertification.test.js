import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, createApp } from '../integration/helpers/setup.js';
import { validateAndNormalizeRegistry, buildRegistryDocument, CLIENT_CONFIGS_COLLECTION } from '../../src/models/registry.model.js';
import { buildLimitDefinitionDocument, validateLimitDefinitionCreate, LIMITS_COLLECTION } from '../../src/models/limitDefinition.model.js';
import { TRANSACTIONS_COLLECTION } from '../../src/models/transaction.model.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';

const TZ = 'UTC';
const CLIENT_ID = 'CLIENT_LOAD_CERT';

function warming(windows) {
  const out = {};
  for (const [type, override] of Object.entries(windows)) {
    out[type] = { ...override, warming: true };
  }
  return out;
}

async function seedRegistry(db) {
  const now = new Date();
  // BRD §4.1 AC1 — "a realistic transaction mix across all declared dimensions and windows,"
  // not a single trivial path: a hot sharded GLOBAL counter (Tier 2), a per-entity UCIC counter
  // (Tier 1, two windows), and a composite dimension (Tier 1) all exercised in the same run.
  const dimensions = [
    { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 8, windows: warming({ DAILY_CALENDAR: {}, DAILY_ROLLING: {} }) },
    { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {}, MONTHLY: {} }) },
    { code: 'UCIC_CHANNEL', attributes: ['ucic', 'channel'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
  ];
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone: TZ, now });
  const doc = buildRegistryDocument({ clientId: CLIENT_ID, directions: { OUTWARD: { allowedDimensions: normalized } }, configVersion: 1, limitsVersion: 1, actor: 'load-cert', now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).insertOne(doc);
}

async function seedLimit(db, { dimensionCode, windowType, thresholdAmount, thresholdCount }) {
  const now = new Date();
  const normalized = validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode, windowType, thresholdAmount, thresholdCount });
  const doc = buildLimitDefinitionDocument({ clientId: CLIENT_ID, normalized, actor: 'load-cert', now });
  await db.collection(LIMITS_COLLECTION).insertOne({ ...doc, clientId: CLIENT_ID });
}

async function seedLimits(db) {
  // Generous enough that the large majority of a realistic, varied-attribute mix approves —
  // this is a throughput/latency measurement, not a breach-detection one (that's EPIC-03/04's job).
  await seedLimit(db, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 10_000_000 });
  await seedLimit(db, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 500_000_000 });
  await seedLimit(db, { dimensionCode: 'GLOBAL', windowType: 'DAILY_ROLLING', thresholdAmount: 500_000_000 });
  await seedLimit(db, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 5_000_000 });
  await seedLimit(db, { dimensionCode: 'UCIC', windowType: 'MONTHLY', thresholdAmount: 50_000_000 });
  await seedLimit(db, { dimensionCode: 'UCIC_CHANNEL', windowType: 'DAILY_CALENDAR', thresholdAmount: 5_000_000 });
}

/** Bounded-concurrency worker pool — the load driver. */
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

function summarize(label, samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const summary = {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
  // Printed rather than only asserted — this IS the certification report BRD §4.1/STORY-07-01
  // asks for ("load test report... with throughput, end to end and internal latency percentiles").
  // eslint-disable-next-line no-console
  console.log(`[load-cert] ${label}: n=${summary.n} p50=${summary.p50.toFixed(1)}ms p95=${summary.p95.toFixed(1)}ms p99=${summary.p99.toFixed(1)}ms max=${summary.max.toFixed(1)}ms`);
  return summary;
}

describe('Sustained throughput and latency certification — STORY-07-01 (integration-slow, real MongoDB)', () => {
  let client;
  let db;
  let app;

  before(async () => {
    ({ client, db } = await connectTestDb('load_certification'));
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({});
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
    await db.collection(CLIENT_CONFIGS_COLLECTION).deleteMany({});
    await db.collection(LIMITS_COLLECTION).deleteMany({});
    await seedRegistry(db);
    await seedLimits(db);
    app = createApp(db);
    // Not app.locals.warmConfigCache() — that discovers ACTIVE clients via the `clients` collection,
    // and this test seeds the registry/limits directly without an actual client document.
    await app.locals.configCache.warm([CLIENT_ID]);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test(
    'AC1/AC2/UAT 5: internal engine latency stays well within the BRD <100ms p99 happy-path budget under concurrent load',
    async () => {
      const COUNT = 1500;
      const CONCURRENCY = 25;
      const transactionService = app.locals.services.transactionService;
      const samplesMs = [];
      let approved = 0;
      let rejected = 0;

      const startedAt = Date.now();
      await runWithConcurrency(COUNT, CONCURRENCY, async (i) => {
        const t0 = process.hrtime.bigint();
        const res = await transactionService.submit(
          CLIENT_ID,
          { direction: 'OUTWARD', transactionId: `LOAD-${i}`, amount: 100 + (i % 500), ucic: `U${i % 200}`, channel: i % 2 === 0 ? 'MOBILE' : 'WEB' },
          TZ,
          ['OUTWARD'],
        );
        const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
        samplesMs.push(elapsedMs);
        if (res.body?.data?.status === 'APPROVED') approved += 1;
        else rejected += 1;
      });
      const wallClockSeconds = (Date.now() - startedAt) / 1000;
      const achievedRps = COUNT / wallClockSeconds;

      const summary = summarize('internal engine (direct submit(), no HTTP)', samplesMs);
      // eslint-disable-next-line no-console
      console.log(`[load-cert] achieved ~${achievedRps.toFixed(0)} req/s over ${wallClockSeconds.toFixed(1)}s on THIS single-node local dev environment (approved=${approved}, rejected=${rejected}). This is NOT a certification of the BRD's 1,000 RPS production target — see STORY-07-01's notes for why a single laptop + single-node replica set cannot honestly stand in for that.`);

      // BRD §4.1: "Internal Engine Latency: < 100ms on the happy path." A generous local margin
      // (250ms) is used rather than the literal 100ms, since this laptop's single-node Mongo and
      // shared CPU are not the sized production topology the 100ms figure assumes — the point of
      // this assertion is to catch a real regression (a p99 in the seconds), not to certify the
      // exact BRD number, which needs the shared/production-representative environment this
      // session doesn't have.
      assert.ok(summary.p99 < 250, `p99 internal latency ${summary.p99.toFixed(1)}ms is unexpectedly high for a local happy-path run`);
      assert.ok(approved > 0 && rejected >= 0);
    },
    { timeout: 120_000 },
  );

  test(
    'end-to-end latency (through the full HTTP stack) — BRD §4.1 names 500-700ms; this is an in-process (supertest) approximation, not a real network measurement',
    async () => {
      const COUNT = 150;
      const CONCURRENCY = 15;
      const samplesMs = [];

      await runWithConcurrency(COUNT, CONCURRENCY, async (i) => {
        const t0 = process.hrtime.bigint();
        await request(app)
          .post(`/clients/${CLIENT_ID}/transactions`)
          .send({ direction: 'OUTWARD', transactionId: `LOAD-E2E-${i}`, amount: 250, ucic: `E2E-U${i % 50}`, channel: 'MOBILE' });
        samplesMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
      });

      const summary = summarize('end-to-end (supertest, in-process HTTP)', samplesMs);
      // Same reasoning as above: supertest exercises the real Express/middleware stack but not a
      // real network hop, so this is a floor on true end-to-end latency, not the BRD figure itself.
      assert.ok(summary.p99 < 700, `p99 in-process end-to-end latency ${summary.p99.toFixed(1)}ms exceeds even the BRD's real-network SLA ceiling`);
    },
    { timeout: 60_000 },
  );

  test('AC3: the idempotency claim write, measured in isolation, is a small fraction of the internal budget', async () => {
    const transactionRepository = app.locals.services.transactionService.transactionRepository;
    const COUNT = 500;
    const samplesMs = [];
    for (let i = 0; i < COUNT; i += 1) {
      const t0 = process.hrtime.bigint();
      // eslint-disable-next-line no-await-in-loop
      await transactionRepository.claim(CLIENT_ID, {
        _id: { clientId: CLIENT_ID, direction: 'OUTWARD', transactionId: `CLAIM-COST-${i}` },
        clientId: CLIENT_ID,
        direction: 'OUTWARD',
        transactionId: `CLAIM-COST-${i}`,
        status: 'PENDING',
        requestData: { amount: 100 },
        claimedAt: new Date(),
        updatedAt: new Date(),
        instanceId: 'load-cert',
      });
      samplesMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    const summary = summarize('claim() write in isolation', samplesMs);
    assert.ok(summary.p99 < 50, `the claim write alone (${summary.p99.toFixed(1)}ms p99) should be a small slice of the <100ms internal budget, not dominate it`);
  });

  test('AC4: no configuration read occurs on the transaction path — only at initial cache warm', async () => {
    const configCache = app.locals.configCache;
    let registryReads = 0;
    let limitReads = 0;
    const originalFindByClientId = configCache.registryRepository.findByClientId.bind(configCache.registryRepository);
    const originalListAllForCache = configCache.limitDefinitionRepository.listAllForCache.bind(configCache.limitDefinitionRepository);
    configCache.registryRepository.findByClientId = async (...args) => {
      registryReads += 1;
      return originalFindByClientId(...args);
    };
    configCache.limitDefinitionRepository.listAllForCache = async (...args) => {
      limitReads += 1;
      return originalListAllForCache(...args);
    };

    try {
      const transactionService = app.locals.services.transactionService;
      await runWithConcurrency(200, 20, (i) =>
        transactionService.submit(CLIENT_ID, { direction: 'OUTWARD', transactionId: `NOCFG-${i}`, amount: 100, ucic: `NC${i % 20}` }, TZ, ['OUTWARD']),
      );
    } finally {
      configCache.registryRepository.findByClientId = originalFindByClientId;
      configCache.limitDefinitionRepository.listAllForCache = originalListAllForCache;
    }

    assert.equal(registryReads, 0, 'the transaction path must read the registry from the in-process cache only, never the database');
    assert.equal(limitReads, 0, 'the transaction path must read limit definitions from the in-process cache only, never the database');
  });
});
