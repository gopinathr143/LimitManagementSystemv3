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

async function seedRegistry(db, clientId, dimensions, timezone = 'UTC') {
  const now = new Date();
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone, now });
  const doc = buildRegistryDocument({ clientId, directions: { OUTWARD: { allowedDimensions: normalized } }, configVersion: 1, limitsVersion: 1, actor: 'test', now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).insertOne(doc);
}

async function seedLimit(db, clientId, { dimensionCode, windowType, thresholdAmount, thresholdCount, effectiveFrom }) {
  const now = new Date();
  const normalized = validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode, windowType, thresholdAmount, thresholdCount, effectiveFrom });
  const doc = buildLimitDefinitionDocument({ clientId, normalized, actor: 'test', now });
  await db.collection(LIMITS_COLLECTION).insertOne({ ...doc, clientId });
}

// Fixed reference point in the past relative to any `now` these tests submit transactions with,
// so a definition's effectiveFrom (which defaults to real wall-clock time) never accidentally
// postdates a test's simulated `now`.
const EFFECTIVE_FROM_PAST = '2020-01-01T00:00:00Z';

function warming(windows) {
  return Object.fromEntries(Object.entries(windows).map(([k, v]) => [k, { ...v, warming: true }]));
}

function buildHarness(db) {
  const transactionRepository = new TransactionRepository(db.collection(TRANSACTIONS_COLLECTION));
  const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
  const registryRepository = new RegistryRepository(db.collection(CLIENT_CONFIGS_COLLECTION));
  const limitDefinitionRepository = new LimitDefinitionRepository(db.collection(LIMITS_COLLECTION));
  const configCache = new ConfigCache(registryRepository, limitDefinitionRepository);
  const counterEngineService = new CounterEngineService(counterRepository, configCache);
  const transactionService = new TransactionService(transactionRepository, configCache, counterEngineService, { instanceId: 'audit-test' });
  return { transactionService, configCache };
}

describe('Audit record completeness — STORY-04-05 (integration, real MongoDB)', () => {
  let client;
  let db;
  let harness;

  before(async () => {
    ({ client, db } = await connectTestDb('transaction_audit'));
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

  test('AC1: a rejected transaction names the breached dimension, window, metric, threshold, definitionVersion and current velocity', async () => {
    // Deliberately NOT hot: this test wants a deterministic, immediate rejection to inspect the audit
    // record's content — Tier 2 (hot) is soft/approximate by design (EPIC-03) and would make this flaky.
    const clientId = 'CLIENT_AUDIT_A';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000000 }); // generous, never binding
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 100, thresholdCount: 5 });
    await harness.configCache.warm([clientId]);

    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'AUD-1', amount: 100, ucic: 'U1' }, 'UTC', ['OUTWARD']);
    const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'AUD-2', amount: 50, ucic: 'U1' }, 'UTC', ['OUTWARD']);
    assert.equal(res.body.data.status, 'REJECTED');

    const doc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'AUD-2' } });
    assert.equal(doc.rejection.dimensionCode, 'UCIC');
    assert.equal(doc.rejection.windowType, 'DAILY_CALENDAR');
    assert.deepEqual(doc.rejection.metrics, ['AMOUNT']);
    assert.equal(doc.rejection.thresholdAmount, 100);
    assert.equal(doc.rejection.definitionVersion, 1);
    assert.equal(doc.rejection.currentAmount, 100);
    assert.equal(doc.rejection.currentCount, 1);
  });

  test('AC2: an approved transaction lists every applied counter key with dimension, window, attributes, shard bucket and shard factor', async () => {
    const clientId = 'CLIENT_AUDIT_B';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'AUD-3', amount: 250, ucic: 'U1' }, 'UTC', ['OUTWARD']);
    const doc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'AUD-3' } });

    assert.equal(doc.status, 'APPROVED');
    const globalKey = doc.appliedCounterKeys.find((k) => k.dimensionCode === 'GLOBAL');
    const ucicKey = doc.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC');

    assert.equal(globalKey.windowType, 'DAILY_CALENDAR');
    assert.deepEqual(globalKey.attributeValues, []);
    assert.ok(globalKey.key.includes('#'), 'GLOBAL is hot — the applied key must name the specific shard bucket');
    assert.equal(typeof globalKey.shardIndex, 'number');
    assert.equal(globalKey.shardFactorUsed, 4);

    assert.equal(ucicKey.windowType, 'DAILY_CALENDAR');
    assert.deepEqual(ucicKey.attributeValues, ['U1']);
    assert.equal(ucicKey.shardIndex, undefined, 'UCIC is not hot — no shard bucket to name');
  });

  test('AC3: the record carries clientId and is retrievable by the compound (clientId, transactionId) key', async () => {
    const clientId = 'CLIENT_AUDIT_C';
    await seedRegistry(db, clientId, [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'AUD-4', amount: 10 }, 'UTC', ['OUTWARD']);
    const doc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'AUD-4' } });
    assert.equal(doc.clientId, clientId);
    assert.equal(doc.transactionId, 'AUD-4');
  });

  test('AC4: a decision taken while a window is warming carries the warming state flag', async () => {
    const clientId = 'CLIENT_AUDIT_D';
    // warming: true (via the `warming()` helper) means this window is enforced immediately, flagged.
    await seedRegistry(db, clientId, [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'AUD-5', amount: 10 }, 'UTC', ['OUTWARD']);
    const doc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'AUD-5' } });
    assert.equal(doc.windowState, 'WARMING');
    assert.equal(doc.appliedCounterKeys[0].warming, true);
  });
});

describe('Client timezone windows — STORY-04-06 (integration, real MongoDB)', () => {
  let client;
  let db;
  let harness;

  before(async () => {
    ({ client, db } = await connectTestDb('transaction_timezone'));
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

  test('AC1/AC2: two clients in different timezones each get their own calendar-day counter bucket', async () => {
    // 20:00 UTC on 2026-08-10 is 2026-08-11 in Asia/Kolkata (UTC+5:30) but still 2026-08-10 in America/Los_Angeles (UTC-7).
    const now = new Date('2026-08-10T20:00:00Z');

    await seedRegistry(db, 'CLIENT_TZ_IN', [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) }], 'Asia/Kolkata');
    await seedLimit(db, 'CLIENT_TZ_IN', { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000, effectiveFrom: EFFECTIVE_FROM_PAST });
    await seedLimit(db, 'CLIENT_TZ_IN', { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000, effectiveFrom: EFFECTIVE_FROM_PAST });

    await seedRegistry(db, 'CLIENT_TZ_US', [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) }], 'America/Los_Angeles');
    await seedLimit(db, 'CLIENT_TZ_US', { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000, effectiveFrom: EFFECTIVE_FROM_PAST });
    await seedLimit(db, 'CLIENT_TZ_US', { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000, effectiveFrom: EFFECTIVE_FROM_PAST });

    await harness.configCache.warm(['CLIENT_TZ_IN', 'CLIENT_TZ_US']);

    await harness.transactionService.submit('CLIENT_TZ_IN', { direction: 'OUTWARD', transactionId: 'TZ-1', amount: 10 }, 'Asia/Kolkata', ['OUTWARD'], now);
    await harness.transactionService.submit('CLIENT_TZ_US', { direction: 'OUTWARD', transactionId: 'TZ-2', amount: 10 }, 'America/Los_Angeles', ['OUTWARD'], now);

    const inCounters = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_TZ_IN' }).toArray();
    const usCounters = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_TZ_US' }).toArray();

    const inBucket = inCounters[0]._id.split(':').pop().split('#')[0];
    const usBucket = usCounters[0]._id.split(':').pop().split('#')[0];

    assert.equal(inBucket, '2026-08-11', "Kolkata's calendar day has already rolled over at 20:00 UTC");
    assert.equal(usBucket, '2026-08-10', "Los Angeles's calendar day has not, at the same instant");
  });
});
