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
  const transactionService = new TransactionService(transactionRepository, configCache, counterEngineService, { instanceId: 'wf-test' });
  return { transactionService, configCache, counterRepository };
}

describe('Config-driven validation waterfall + compensating saga — STORY-04-03/04-04 (integration, real MongoDB)', () => {
  let client;
  let db;
  let harness;

  before(async () => {
    ({ client, db } = await connectTestDb('transaction_waterfall'));
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

  test('AC1: a dimension whose required attribute is absent is skipped without error', async () => {
    const clientId = 'CLIENT_WF_A';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 100 }); // would breach if evaluated
    await harness.configCache.warm([clientId]);

    // No `ucic` in the payload — UCIC must be skipped, not error, and its (tiny) threshold must never be checked.
    const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'T1', amount: 5000  }, TZ, ['OUTWARD']);
    assert.equal(res.body.data.status, 'APPROVED');
    assert.ok(res.body.data.appliedCounterKeys.every((k) => k.dimensionCode === 'GLOBAL'));
  });

  test('AC2 + STORY-04-04 AC1: a monthly breach after daily passes rejects and rolls back the already-applied daily counter', async () => {
    const clientId = 'CLIENT_WF_B';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {}, MONTHLY: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 }); // generous — passes
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'MONTHLY', thresholdAmount: 100 }); // tight — breaches
    await harness.configCache.warm([clientId]);

    const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'T2', amount: 150, ucic: 'U1'  }, TZ, ['OUTWARD']);
    assert.equal(res.body.data.status, 'REJECTED');
    assert.equal(res.body.data.rejection.dimensionCode, 'UCIC');
    assert.equal(res.body.data.rejection.windowType, 'MONTHLY');

    const counters = await db.collection(COUNTERS_COLLECTION).find({ clientId }).toArray();
    const totalAmount = counters.reduce((sum, c) => sum + (c.amount ?? 0), 0);
    assert.equal(totalAmount, 0, 'GLOBAL daily (applied before the breach) and UCIC daily must both be rolled back to zero');
  });

  test('AC3: daily and monthly limits are enforced independently at different dimensions in the same transaction', async () => {
    const clientId = 'CLIENT_WF_C';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ MONTHLY: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'MONTHLY', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'T3', amount: 250, ucic: 'U1'  }, TZ, ['OUTWARD']);
    assert.equal(res.body.data.status, 'APPROVED');
    const byDimension = Object.fromEntries(res.body.data.appliedCounterKeys.map((k) => [`${k.dimensionCode}:${k.windowType}`, k]));
    assert.ok(byDimension['GLOBAL:DAILY_CALENDAR']);
    assert.ok(byDimension['UCIC:MONTHLY']);
  });

  test('AC4: a new dimension declared in the registry is enforced immediately, with no code change', async () => {
    const clientId = 'CLIENT_WF_D';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC_CHANNEL', attributes: ['ucic', 'channel'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC_CHANNEL', windowType: 'DAILY_CALENDAR', thresholdAmount: 50 });
    await harness.configCache.warm([clientId]);

    const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'T4', amount: 60, ucic: 'U1', channel: 'MOBILE'  }, TZ, ['OUTWARD']);
    assert.equal(res.body.data.status, 'REJECTED');
    assert.equal(res.body.data.rejection.dimensionCode, 'UCIC_CHANNEL');
  });

  test('AC5: a dimension breaches on count alone while amount stays in range, and the reverse case also holds', async () => {
    const clientId = 'CLIENT_WF_E';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000, thresholdCount: 1 });
    await harness.configCache.warm([clientId]);

    const first = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'T5A', amount: 10, ucic: 'U_COUNT'  }, TZ, ['OUTWARD']);
    assert.equal(first.body.data.status, 'APPROVED');
    const second = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'T5B', amount: 10, ucic: 'U_COUNT'  }, TZ, ['OUTWARD']);
    assert.equal(second.body.data.status, 'REJECTED');
    assert.deepEqual(second.body.data.rejection.metrics, ['COUNT']);
  });

  test('AC6: the first breach stops evaluation immediately — a later dimension is never checked or written', async () => {
    const clientId = 'CLIENT_WF_F';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 10 }); // breaches first
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'T6', amount: 100, ucic: 'U1'  }, TZ, ['OUTWARD']);
    assert.equal(res.body.data.status, 'REJECTED');
    assert.equal(res.body.data.rejection.dimensionCode, 'GLOBAL');

    const ucicCounters = await db.collection(COUNTERS_COLLECTION).find({ clientId, _id: { $regex: '^limit:CLIENT_WF_F:OUTWARD:UCIC:' } }).toArray();
    assert.equal(ucicCounters.length, 0, 'UCIC must never have been touched once GLOBAL had already breached');
  });
});
