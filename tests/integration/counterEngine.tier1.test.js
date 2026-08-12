import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { CounterRepository } from '../../src/repositories/counter.repository.js';
import { CounterEngineService } from '../../src/services/counterEngine.service.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';

describe('CounterEngineService Tier 1 — STORY-03-03 (integration, real MongoDB replica set)', () => {
  let client;
  let db;
  let engine;

  before(async () => {
    ({ client, db } = await connectTestDb('counter_tier1'));
    const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
    engine = new CounterEngineService(counterRepository, null);
  });

  beforeEach(async () => {
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1: within threshold — approved, atomically incremented', async () => {
    const result = await engine.checkAndIncrementTier1('CLIENT_T1', {
      direction: 'OUTWARD',
      dimensionCode: 'UCIC',
      windowType: 'DAILY_CALENDAR',
      attributeValues: ['U1'],
      timezone: 'UTC',
      txnAmount: 500,
      thresholdAmount: 1000,
    });
    assert.equal(result.passed, true);
    assert.ok(result.appliedKey);
  });

  test('AC2/UAT 33: an amount landing exactly on the threshold is approved; one paisa over is rejected', async () => {
    const opts = { direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', attributeValues: ['U2'], timezone: 'UTC', thresholdAmount: 1000 };
    const exact = await engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, txnAmount: 1000 });
    assert.equal(exact.passed, true);

    const overByOne = await engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, attributeValues: ['U3'], txnAmount: 1001 });
    assert.equal(overByOne.passed, false);
  });

  test('AC2 (breach): the guarded update returns matchedCount 0, not a duplicate-key error, on the first attempt', async () => {
    const opts = { direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', attributeValues: ['U4'], timezone: 'UTC', thresholdAmount: 1000 };
    await engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, txnAmount: 900 });
    const breach = await engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, txnAmount: 200 });
    assert.equal(breach.passed, false);
    assert.deepEqual(breach.breach.metrics, ['AMOUNT']);
    assert.equal(breach.breach.currentAmount, 900);
  });

  test('AC5: independent amount vs count breach — the audit names the metric that actually breached', async () => {
    const opts = {
      direction: 'OUTWARD',
      dimensionCode: 'UCIC',
      windowType: 'DAILY_CALENDAR',
      attributeValues: ['U5'],
      timezone: 'UTC',
      thresholdAmount: 1000000,
      thresholdCount: 2,
    };
    await engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, txnAmount: 1 });
    await engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, txnAmount: 1 });
    // Third transaction: amount is nowhere near its cap, but count would exceed 2.
    const breach = await engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, txnAmount: 1 });
    assert.equal(breach.passed, false);
    assert.deepEqual(breach.breach.metrics, ['COUNT']);
  });

  test('AC4/UAT 30: concurrent bootstrap race on a brand-new key resolves cleanly for every caller', async () => {
    const opts = { direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', attributeValues: ['U6'], timezone: 'UTC', thresholdAmount: 1000000 };
    const results = await Promise.all(Array.from({ length: 20 }, () => engine.checkAndIncrementTier1('CLIENT_T1', { ...opts, txnAmount: 10 })));
    assert.ok(results.every((r) => r.passed === true), 'no concurrent bootstrap race should surface as an error or a spurious breach');
  });

  test('AC6/UAT 31-style: exactly K of N concurrent requests are approved, with zero overshoot', async () => {
    const THRESHOLD = 1000;
    const TXN_AMOUNT = 100;
    const EXPECTED_APPROVALS = THRESHOLD / TXN_AMOUNT; // 10
    const CONCURRENT_REQUESTS = 30;

    const opts = {
      direction: 'OUTWARD',
      dimensionCode: 'UCIC',
      windowType: 'DAILY_CALENDAR',
      attributeValues: ['U_HOT_ENTITY'],
      timezone: 'UTC',
      txnAmount: TXN_AMOUNT,
      thresholdAmount: THRESHOLD,
    };

    const results = await Promise.all(Array.from({ length: CONCURRENT_REQUESTS }, () => engine.checkAndIncrementTier1('CLIENT_T1', opts)));
    const approved = results.filter((r) => r.passed).length;
    const rejected = results.filter((r) => !r.passed).length;

    assert.equal(approved, EXPECTED_APPROVALS, 'exactly the sized-for count must be approved, no overshoot');
    assert.equal(rejected, CONCURRENT_REQUESTS - EXPECTED_APPROVALS);

    const key = results.find((r) => r.passed).appliedKey;
    const stored = await db.collection(COUNTERS_COLLECTION).findOne({ _id: key });
    assert.equal(stored.amount, THRESHOLD);
    assert.equal(stored.count, EXPECTED_APPROVALS);
  });

  test('compensateTier1: reversing an applied increment decrements exactly, and the floor guard holds', async () => {
    const opts = { direction: 'OUTWARD', dimensionCode: 'ACCOUNT', windowType: 'DAILY_CALENDAR', attributeValues: ['A1'], timezone: 'UTC', txnAmount: 300, thresholdAmount: 1000 };
    const applied = await engine.checkAndIncrementTier1('CLIENT_T1', opts);
    assert.equal(applied.passed, true);

    const compensation = await engine.compensateTier1('CLIENT_T1', applied.appliedKey, { amountDelta: 300, countDelta: 1 });
    assert.equal(compensation.floorGuardHeld, true);

    const stored = await db.collection(COUNTERS_COLLECTION).findOne({ _id: applied.appliedKey });
    assert.equal(stored.amount, 0);
    assert.equal(stored.count, 0);
  });

  test('compensateTier1 floor guard refuses to go negative', async () => {
    const opts = { direction: 'OUTWARD', dimensionCode: 'ACCOUNT', windowType: 'DAILY_CALENDAR', attributeValues: ['A2'], timezone: 'UTC', txnAmount: 100, thresholdAmount: 1000 };
    const applied = await engine.checkAndIncrementTier1('CLIENT_T1', opts);
    const overCompensate = await engine.compensateTier1('CLIENT_T1', applied.appliedKey, { amountDelta: 999999, countDelta: 1 });
    assert.equal(overCompensate.floorGuardHeld, false, 'decrementing past zero must be refused, not silently applied');
  });
});
