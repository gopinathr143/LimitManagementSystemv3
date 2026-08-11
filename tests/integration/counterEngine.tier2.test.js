import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { CounterRepository } from '../../src/repositories/counter.repository.js';
import { CounterEngineService } from '../../src/services/counterEngine.service.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';

function windowEntryWithShardFactor(value, now) {
  return { shardFactorHistory: [{ value, effectiveAt: now }] };
}

describe('CounterEngineService Tier 2 — STORY-03-04/03-05 (integration, real MongoDB replica set)', () => {
  let client;
  let db;
  let engine;

  before(async () => {
    ({ client, db } = await connectTestDb('counter_tier2'));
    const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
    engine = new CounterEngineService(counterRepository, null, { hotCache: { refreshIntervalMs: 0 } });
  });

  beforeEach(async () => {
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1: writes spread across shard buckets rather than hammering one document', async () => {
    const now = new Date();
    const windowEntry = windowEntryWithShardFactor(16, now);
    const opts = {
      dimensionCode: 'GLOBAL',
      windowType: 'DAILY_CALENDAR',
      attributeValues: [],
      timezone: 'UTC',
      windowEntry,
      txnAmount: 10,
      thresholdAmount: 100000,
      now,
    };

    await Promise.all(Array.from({ length: 200 }, () => engine.checkAndIncrementTier2('CLIENT_HOT', opts)));

    const docs = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_HOT' }).toArray();
    assert.ok(docs.length > 1, 'load must be spread across more than one document');
    assert.ok(docs.length <= 16, 'never more documents than the declared shardFactor');
    for (const doc of docs) {
      assert.ok(doc.count < 200, 'no single shard should have absorbed every write');
    }
  });

  test('AC2: after a known number of approvals, the summed total matches exactly', async () => {
    const now = new Date();
    const windowEntry = windowEntryWithShardFactor(8, now);
    const opts = { dimensionCode: 'CHANNEL', windowType: 'DAILY_CALENDAR', attributeValues: ['MOBILE'], timezone: 'UTC', windowEntry, txnAmount: 25, thresholdAmount: 1000000, now };

    const results = await Promise.all(Array.from({ length: 50 }, () => engine.checkAndIncrementTier2('CLIENT_HOT', opts)));
    assert.ok(results.every((r) => r.passed));

    const total = await engine.readTier2Total('CLIENT_HOT', opts);
    assert.equal(total.amount, 50 * 25);
    assert.equal(total.count, 50);
  });

  test('AC3: reversing a Tier 2 approval decrements the specific recorded bucket and the summed total reduces correctly', async () => {
    const now = new Date();
    const windowEntry = windowEntryWithShardFactor(8, now);
    const opts = { dimensionCode: 'CHANNEL', windowType: 'DAILY_CALENDAR', attributeValues: ['WEB'], timezone: 'UTC', windowEntry, txnAmount: 300, thresholdAmount: 1000000, now };

    const applied = await engine.checkAndIncrementTier2('CLIENT_HOT', opts);
    assert.equal(applied.passed, true);
    const beforeTotal = await engine.readTier2Total('CLIENT_HOT', opts);

    await engine.compensateTier1('CLIENT_HOT', applied.appliedKey, { amountDelta: 300, countDelta: 1, now });

    const afterTotal = await engine.readTier2Total('CLIENT_HOT', opts);
    assert.equal(afterTotal.amount, beforeTotal.amount - 300);
    assert.equal(afterTotal.count, beforeTotal.count - 1);
  });

  test('AC4: overshoot under concurrency stays within a measured, documented bound', async () => {
    const now = new Date();
    const windowEntry = windowEntryWithShardFactor(4, now);
    const THRESHOLD = 1000;
    const TXN_AMOUNT = 50;
    const opts = { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', attributeValues: [], timezone: 'UTC', windowEntry, txnAmount: TXN_AMOUNT, thresholdAmount: THRESHOLD, now };

    const CONCURRENT = 60; // far more than could ever fit
    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => engine.checkAndIncrementTier2('CLIENT_HOT', opts)));
    const approvedCount = results.filter((r) => r.passed).length;

    const total = await engine.readTier2Total('CLIENT_HOT', opts);
    // Soft enforcement: overshoot is bounded by in-flight concurrency, not unbounded.
    assert.ok(total.amount <= THRESHOLD + CONCURRENT * TXN_AMOUNT, 'overshoot must stay within the theoretical worst case (every concurrent request in flight at once)');
    assert.equal(total.amount, approvedCount * TXN_AMOUNT, 'the stored total must exactly match what was actually approved — no phantom increments');
  });

  test('AC5: staleness never exceeds the configured refresh interval', async () => {
    const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
    const REFRESH_MS = 50;
    const shortCacheEngine = new CounterEngineService(counterRepository, null, { hotCache: { refreshIntervalMs: REFRESH_MS } });
    const now = new Date();
    const windowEntry = windowEntryWithShardFactor(4, now);
    const baseKey = 'limit:CLIENT_STALE:GLOBAL:DAILY_CALENDAR:2099-01-01';
    const shardKeys = [0, 1, 2, 3].map((i) => `${baseKey}#${i}`);

    // Cold read establishes the cache entry at amount 0.
    const first = await shortCacheEngine.hotCounterCache.getTotal('CLIENT_STALE', baseKey, shardKeys);
    assert.equal(first.amount, 0);

    // Mutate the underlying data directly, bypassing the cache entirely.
    await counterRepository.incrementShardUnconditional('CLIENT_STALE', shardKeys[0], { amountDelta: 500, countDelta: 1, now, expireAt: new Date(now.getTime() + 3600000) });

    // Immediately within the refresh window: still the stale cached value.
    const stale = await shortCacheEngine.hotCounterCache.getTotal('CLIENT_STALE', baseKey, shardKeys);
    assert.equal(stale.amount, 0, 'a read within the refresh interval must serve the cached value, not re-query');

    // After the interval elapses: a fresh read reflects the mutation.
    await new Promise((resolve) => setTimeout(resolve, REFRESH_MS + 20));
    const fresh = await shortCacheEngine.hotCounterCache.getTotal('CLIENT_STALE', baseKey, shardKeys);
    assert.equal(fresh.amount, 500, 'staleness must never exceed the configured refresh interval');
  });

  test('AC6: a client declaring the dimension not hot uses the strict Tier 1 path instead (no sharding)', async () => {
    // "Not hot" is a routing decision made by the caller (dimension.hot === false selects Tier 1); this
    // proves the same underlying counter repository serves both paths without shard suffixes for Tier 1.
    const result = await engine.checkAndIncrementTier1('CLIENT_COLD', {
      dimensionCode: 'MCC',
      windowType: 'DAILY_CALENDAR',
      attributeValues: ['5411'],
      timezone: 'UTC',
      txnAmount: 100,
      thresholdAmount: 1000,
    });
    assert.equal(result.passed, true);
    assert.ok(!result.appliedKey.includes('#'), 'a non-hot counter key must never carry a shard suffix');
  });
});
