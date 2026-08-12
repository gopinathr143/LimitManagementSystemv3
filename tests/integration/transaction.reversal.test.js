import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { TransactionRepository } from '../../src/repositories/transaction.repository.js';
import { CounterRepository } from '../../src/repositories/counter.repository.js';
import { RegistryRepository } from '../../src/repositories/registry.repository.js';
import { LimitDefinitionRepository } from '../../src/repositories/limitDefinition.repository.js';
import { TransactionService } from '../../src/services/transaction.service.js';
import { CounterEngineService } from '../../src/services/counterEngine.service.js';
import { ConfigCache } from '../../src/services/configCache.service.js';
import { TRANSACTIONS_COLLECTION } from '../../src/models/transaction.model.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';
import { CLIENT_CONFIGS_COLLECTION, validateAndNormalizeRegistry, buildRegistryDocument } from '../../src/models/registry.model.js';
import { LIMITS_COLLECTION, buildLimitDefinitionDocument, validateLimitDefinitionCreate } from '../../src/models/limitDefinition.model.js';

const TZ = 'UTC';

async function seedRegistry(db, clientId, dimensions) {
  const now = new Date();
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone: TZ, now });
  const doc = buildRegistryDocument({ clientId, directions: { OUTWARD: { allowedDimensions: normalized } }, configVersion: 1, limitsVersion: 1, actor: 'test', now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).insertOne(doc);
}

async function replaceRegistry(db, clientId, dimensions) {
  const now = new Date();
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone: TZ, now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).updateOne({ _id: clientId }, { $set: { 'directions.OUTWARD.allowedDimensions': normalized, updatedAt: now } });
}

async function seedLimit(db, clientId, { dimensionCode, windowType, thresholdAmount, thresholdCount, scope }) {
  const now = new Date();
  const normalized = validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode, windowType, thresholdAmount, thresholdCount, scope });
  const doc = buildLimitDefinitionDocument({ clientId, normalized, actor: 'test', now });
  await db.collection(LIMITS_COLLECTION).insertOne({ ...doc, clientId });
}

function warming(windows) {
  const out = {};
  for (const [type, override] of Object.entries(windows)) {
    out[type] = { ...override, warming: true };
  }
  return out;
}

function buildHarness(db) {
  const transactionRepository = new TransactionRepository(db.collection(TRANSACTIONS_COLLECTION));
  const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
  const registryRepository = new RegistryRepository(db.collection(CLIENT_CONFIGS_COLLECTION));
  const limitDefinitionRepository = new LimitDefinitionRepository(db.collection(LIMITS_COLLECTION));
  const configCache = new ConfigCache(registryRepository, limitDefinitionRepository);
  const counterEngineService = new CounterEngineService(counterRepository, configCache);
  const transactionService = new TransactionService(transactionRepository, configCache, counterEngineService, { instanceId: 'rev-test' });
  return { transactionService, configCache, counterRepository };
}

async function sumCounters(db, clientId) {
  const docs = await db.collection(COUNTERS_COLLECTION).find({ clientId }).toArray();
  return docs.reduce((sum, d) => sum + (d.amount ?? 0), 0);
}

describe('Reversal API — STORY-05-01 (integration, real MongoDB)', () => {
  let client;
  let db;
  let harness;

  before(async () => {
    ({ client, db } = await connectTestDb('transaction_reversal'));
  });

  beforeEach(async () => {
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({});
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
    await db.collection(CLIENT_CONFIGS_COLLECTION).deleteMany({});
    await db.collection(LIMITS_COLLECTION).deleteMany({});
    harness = buildHarness(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1: reversal decrements the exact recorded documents (tier1 plain key and tier2 specific shard bucket) and flips status to REVERSED', async () => {
    const clientId = 'CLIENT_REV_A';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const approved = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'REV1', amount: 300, ucic: 'U1'  }, TZ, ['OUTWARD']);
    assert.equal(approved.body.data.status, 'APPROVED');
    const globalKey = approved.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'GLOBAL');
    const ucicKey = approved.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC');
    assert.ok(globalKey.key.includes('#'), 'GLOBAL is hot — the applied key must be a specific shard bucket');
    assert.ok(!ucicKey.key.includes('#'), 'UCIC is not hot — the applied key must be the plain tier1 document');

    const beforeGlobal = await db.collection(COUNTERS_COLLECTION).findOne({ _id: globalKey.key });
    assert.equal(beforeGlobal.amount, 300);

    const result = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV1', 'customer-requested');
    assert.equal(result.httpStatus, 200);
    assert.equal(result.body.data.status, 'REVERSED');
    assert.equal(result.body.data.reversedCounters.length, 2);
    assert.ok(result.body.data.reversedCounters.every((r) => r.skipped === false && r.floorGuardHeld === true));

    const afterGlobal = await db.collection(COUNTERS_COLLECTION).findOne({ _id: globalKey.key });
    assert.equal(afterGlobal.amount, 0, 'the exact recorded shard bucket must be decremented, not just the aggregate total');
    assert.equal(afterGlobal.count, 0);
    const afterUcic = await db.collection(COUNTERS_COLLECTION).findOne({ _id: ucicKey.key });
    assert.equal(afterUcic.amount, 0);

    const txnDoc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'REV1' } });
    assert.equal(txnDoc.status, 'REVERSED');
    assert.equal(txnDoc.reversalReason, 'customer-requested');
    assert.ok(txnDoc.reversedAt instanceof Date);
  });

  test('AC2: a repeated reversal call is a no-op with no double decrement', async () => {
    const clientId = 'CLIENT_REV_B';
    await seedRegistry(db, clientId, [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'REV2', amount: 500  }, TZ, ['OUTWARD']);
    const first = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV2');
    assert.equal(first.body.data.reversedCounters.length, 1);
    assert.equal(await sumCounters(db, clientId), 0);

    const second = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV2');
    assert.equal(second.httpStatus, 200);
    assert.equal(second.body.data.alreadyReversed, true);
    assert.equal(second.body.data.reversedCounters, undefined);
    assert.equal(await sumCounters(db, clientId), 0, 'a second reversal call must never decrement again');
  });

  test('AC3: two concurrent reversal calls for one transaction — only one applies decrements', async () => {
    const clientId = 'CLIENT_REV_C';
    await seedRegistry(db, clientId, [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'REV3', amount: 400  }, TZ, ['OUTWARD']);

    const [a, b] = await Promise.all([
      harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV3'),
      harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV3'),
    ]);

    const responses = [a, b];
    const real = responses.filter((r) => r.body.data.reversedCounters !== undefined);
    const noOps = responses.filter((r) => r.body.data.alreadyReversed === true);
    assert.equal(real.length, 1, 'exactly one concurrent caller must win the status flip and apply decrements');
    assert.equal(noOps.length, 1, 'the other caller must observe the already-REVERSED no-op path');
    assert.equal(await sumCounters(db, clientId), 0, 'the counter must be decremented exactly once, never twice');
  });

  test('AC4: reversal of a rejected, already-reversed or non-existent transaction is a no-op/error and touches no counter', async () => {
    const clientId = 'CLIENT_REV_D';
    await seedRegistry(db, clientId, [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 10 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const rejected = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'REV4A', amount: 999  }, TZ, ['OUTWARD']);
    assert.equal(rejected.body.data.status, 'REJECTED');

    const notReversible = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV4A');
    assert.equal(notReversible.httpStatus, 409);
    assert.equal(notReversible.body.error.code, 'TRANSACTION_NOT_REVERSIBLE');
    assert.equal(await sumCounters(db, clientId), 0);

    await assert.rejects(
      () => harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV4-NEVER-EXISTED'),
      (err) => err.statusCode === 404 && err.code === 'TRANSACTION_NOT_FOUND',
    );
  });

  test('AC5: a dimension de-activated in the registry after approval is skipped by reversal without erroring, while other recorded counters still decrement', async () => {
    const clientId = 'CLIENT_REV_E';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const approved = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'REV5', amount: 200, ucic: 'U1'  }, TZ, ['OUTWARD']);
    assert.equal(approved.body.data.status, 'APPROVED');
    const ucicKey = approved.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC');
    const globalKey = approved.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'GLOBAL');

    // UCIC is removed from the registry entirely — the counter it left behind is no longer runtime-governed.
    await replaceRegistry(db, clientId, [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await harness.configCache.refreshOne(clientId);

    const result = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV5');
    assert.equal(result.httpStatus, 200);
    const ucicResult = result.body.data.reversedCounters.find((r) => r.key === ucicKey.key);
    const globalResult = result.body.data.reversedCounters.find((r) => r.key === globalKey.key);
    assert.deepEqual(ucicResult, { key: ucicKey.key, skipped: true, reason: 'NOT_GOVERNED' });
    assert.equal(globalResult.skipped, false);
    assert.equal(globalResult.floorGuardHeld, true);

    const ucicDoc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: ucicKey.key });
    assert.equal(ucicDoc.amount, 200, 'a de-activated dimension counter must be left untouched by reversal');
    const globalDoc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: globalKey.key });
    assert.equal(globalDoc.amount, 0, 'other still-governed counters must still be decremented correctly');
  });

  test('AC6: a decrement that would drive a counter below zero is prevented by the floor guard and recorded as a drift signal', async () => {
    const clientId = 'CLIENT_REV_F';
    await seedRegistry(db, clientId, [{ code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }, { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const approved = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'REV6', amount: 300, ucic: 'U1'  }, TZ, ['OUTWARD']);
    assert.equal(approved.body.data.status, 'APPROVED');
    const ucicKey = approved.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC');

    // Simulate drift/corruption: the physical document no longer has enough balance to absorb the recorded decrement.
    await db.collection(COUNTERS_COLLECTION).updateOne({ _id: ucicKey.key }, { $set: { amount: 0, count: 0 } });

    const result = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REV6');
    assert.equal(result.httpStatus, 200);
    const ucicResult = result.body.data.reversedCounters.find((r) => r.key === ucicKey.key);
    assert.equal(ucicResult.skipped, false);
    assert.equal(ucicResult.floorGuardHeld, false, 'the floor guard must report failure rather than silently applying a negative decrement');

    const doc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: ucicKey.key });
    assert.equal(doc.amount, 0, 'the floor guard must prevent the counter from ever going negative');
    assert.equal(doc.count, 0);
  });
});
