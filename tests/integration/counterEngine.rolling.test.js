import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { CounterRepository } from '../../src/repositories/counter.repository.js';
import { CounterEngineService } from '../../src/services/counterEngine.service.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';

function windowEntryWithShardFactor(value, now) {
  return { shardFactorHistory: [{ value, effectiveAt: now }] };
}

describe('CounterEngineService rolling window — STORY-03-06 (integration, real MongoDB replica set)', () => {
  let client;
  let db;
  let engine;

  before(async () => {
    ({ client, db } = await connectTestDb('counter_rolling'));
    const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
    engine = new CounterEngineService(counterRepository, null, { hotCache: { refreshIntervalMs: 0 } });
  });

  beforeEach(async () => {
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1/UAT 1: exactly K of N concurrent requests are approved against one entity, zero overshoot', async () => {
    const THRESHOLD = 1000;
    const TXN_AMOUNT = 100;
    const EXPECTED_APPROVALS = THRESHOLD / TXN_AMOUNT; // 10
    const CONCURRENT_REQUESTS = 30;

    const opts = { dimensionCode: 'UCIC', attributeValues: ['U_ROLLING_HOT'], txnAmount: TXN_AMOUNT, thresholdAmount: THRESHOLD };

    const results = await Promise.all(Array.from({ length: CONCURRENT_REQUESTS }, () => engine.checkAndIncrementRolling('CLIENT_R1', opts)));
    const approved = results.filter((r) => r.passed).length;

    assert.equal(approved, EXPECTED_APPROVALS, 'the atomic pipeline update must admit exactly the sized-for count, no overshoot');

    const key = results.find((r) => r.passed).appliedKey;
    const doc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: key });
    const totalAmount = Object.values(doc.buckets).reduce((sum, b) => sum + b.a, 0);
    assert.equal(totalAmount, THRESHOLD);
  });

  test('AC2/UAT 32: expired sub-buckets are pruned on the next update and the document stays bounded', async () => {
    const key = 'limit:CLIENT_R2:UCIC:DAILY_ROLLING:U_PRUNE';
    const now = new Date('2026-08-10T12:00:00Z');

    // Seed 30 hourly buckets spanning far past the 24h horizon (simulating an old, un-pruned document).
    const buckets = {};
    for (let h = 0; h < 30; h += 1) {
      const bucketTime = new Date(now.getTime() - h * 60 * 60 * 1000);
      const label = bucketTime.toISOString().slice(0, 13).replace('T', '-'); // yyyy-MM-dd-HH
      buckets[label] = { a: 10, c: 1 };
    }
    await db.collection(COUNTERS_COLLECTION).insertOne({ _id: key, clientId: 'CLIENT_R2', buckets, createdAt: now, updatedAt: now, expireAt: new Date(now.getTime() + 90000000) });

    const before = await db.collection(COUNTERS_COLLECTION).findOne({ _id: key });
    assert.equal(Object.keys(before.buckets).length, 30);

    const result = await engine.checkAndIncrementRolling('CLIENT_R2', { dimensionCode: 'UCIC', attributeValues: ['U_PRUNE'], txnAmount: 5, thresholdAmount: 1000000, now });
    assert.equal(result.passed, true);

    const after = await db.collection(COUNTERS_COLLECTION).findOne({ _id: key });
    assert.ok(Object.keys(after.buckets).length <= 25, `document must stay bounded to ~25 hourly buckets, got ${Object.keys(after.buckets).length}`);
  });

  test('AC3: a breach returns _applied:false and exact current velocity in the same round trip', async () => {
    const opts = { dimensionCode: 'UCIC', attributeValues: ['U_BREACH'], thresholdAmount: 1000 };
    await engine.checkAndIncrementRolling('CLIENT_R3', { ...opts, txnAmount: 900 });
    const breach = await engine.checkAndIncrementRolling('CLIENT_R3', { ...opts, txnAmount: 200 });
    assert.equal(breach.passed, false);
    assert.equal(breach.breach.currentAmount, 900);
  });

  test('AC4: the rolling window does not reset at a calendar-day boundary', async () => {
    const opts = { dimensionCode: 'UCIC', attributeValues: ['U_MIDNIGHT'], thresholdAmount: 1000 };
    const beforeMidnight = new Date('2026-08-10T23:50:00Z');
    await engine.checkAndIncrementRolling('CLIENT_R4', { ...opts, txnAmount: 900, now: beforeMidnight });

    const afterMidnight = new Date('2026-08-11T00:10:00Z'); // 20 minutes later, new calendar day
    const breach = await engine.checkAndIncrementRolling('CLIENT_R4', { ...opts, txnAmount: 200, now: afterMidnight });
    assert.equal(breach.passed, false, 'the rolling window must still see the pre-midnight 900 and reject');
  });

  test('AC5: MINUTE granularity tightens precision and the document remains within size limits', async () => {
    const opts = { dimensionCode: 'ACCOUNT', attributeValues: ['A_MINUTE'], thresholdAmount: 1000000, granularity: 'MINUTE' };
    const now = new Date('2026-08-10T12:00:00Z');

    for (let i = 0; i < 30; i += 1) {
      const at = new Date(now.getTime() + i * 60 * 1000); // 30 distinct minutes
      // eslint-disable-next-line no-await-in-loop
      await engine.checkAndIncrementRolling('CLIENT_R5', { ...opts, txnAmount: 10, now: at });
    }

    const key = 'limit:CLIENT_R5:ACCOUNT:DAILY_ROLLING:A_MINUTE';
    const doc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: key });
    assert.equal(Object.keys(doc.buckets).length, 30, 'minute granularity must produce one sub-bucket per minute, not per hour');
    assert.ok(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(Object.keys(doc.buckets)[0]));
  });

  test('AC6: a hot rolling dimension shards and reverts to soft/unconditional semantics', async () => {
    const now = new Date();
    const windowEntry = windowEntryWithShardFactor(8, now);
    const opts = { dimensionCode: 'GLOBAL', attributeValues: [], windowEntry, txnAmount: 10, thresholdAmount: 100000, now };

    const results = await Promise.all(Array.from({ length: 50 }, () => engine.checkAndIncrementRollingSharded('CLIENT_R6', opts)));
    assert.ok(results.every((r) => r.passed), 'sharded rolling is soft/unconditional — nothing should be rejected here');

    const total = await engine.readRollingShardedTotal('CLIENT_R6', { dimensionCode: 'GLOBAL', attributeValues: [], windowEntry, now });
    assert.equal(total.amount, 500);
    assert.equal(total.count, 50);

    const docs = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_R6' }).toArray();
    assert.ok(docs.length > 1, 'load must be spread across more than one shard document');
  });

  test('compensateRolling: reverses the exact recorded bucket, and a pruned/drained bucket is reported as a drift signal', async () => {
    const opts = { dimensionCode: 'UCIC', attributeValues: ['U_REVERSE'], txnAmount: 300, thresholdAmount: 1000 };
    const applied = await engine.checkAndIncrementRolling('CLIENT_R7', opts);
    assert.equal(applied.passed, true);

    const compensation = await engine.compensateRolling('CLIENT_R7', applied.appliedKey, {
      bucketLabel: applied.bucketLabel,
      amountDelta: 300,
      countDelta: 1,
    });
    assert.equal(compensation.floorGuardHeld, true);

    const doc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: applied.appliedKey });
    assert.equal(doc.buckets[applied.bucketLabel].a, 0);

    const overCompensate = await engine.compensateRolling('CLIENT_R7', applied.appliedKey, {
      bucketLabel: applied.bucketLabel,
      amountDelta: 1,
      countDelta: 0,
    });
    assert.equal(overCompensate.floorGuardHeld, false, 'decrementing an already-drained bucket must be refused, not silently applied');
  });
});
