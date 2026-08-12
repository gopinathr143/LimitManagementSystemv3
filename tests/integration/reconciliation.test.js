import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { TransactionRepository } from '../../src/repositories/transaction.repository.js';
import { CounterRepository } from '../../src/repositories/counter.repository.js';
import { RegistryRepository } from '../../src/repositories/registry.repository.js';
import { LimitDefinitionRepository } from '../../src/repositories/limitDefinition.repository.js';
import { ReconciliationRepository } from '../../src/repositories/reconciliation.repository.js';
import { TransactionService } from '../../src/services/transaction.service.js';
import { CounterEngineService } from '../../src/services/counterEngine.service.js';
import { ConfigCache } from '../../src/services/configCache.service.js';
import { ReconciliationService } from '../../src/services/reconciliation.service.js';
import { TRANSACTIONS_COLLECTION } from '../../src/models/transaction.model.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';
import { RECONCILIATION_QUEUE_COLLECTION, buildDriftSignalDocument } from '../../src/models/reconciliation.model.js';
import { CLIENT_CONFIGS_COLLECTION, validateAndNormalizeRegistry, buildRegistryDocument } from '../../src/models/registry.model.js';
import { LIMITS_COLLECTION, buildLimitDefinitionDocument, validateLimitDefinitionCreate } from '../../src/models/limitDefinition.model.js';

const TZ = 'UTC';
// Far enough in the past that the DAILY_CALENDAR window it lands in has long since closed relative to real wall-clock "now" — used to produce a closed-window counter without waiting a day.
const CLOSED_WINDOW_NOW = new Date('2020-01-01T00:00:00Z');

async function seedRegistry(db, clientId, dimensions) {
  const now = new Date();
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone: TZ, now });
  const doc = buildRegistryDocument({ clientId, directions: { OUTWARD: { allowedDimensions: normalized } }, configVersion: 1, limitsVersion: 1, actor: 'test', now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).insertOne(doc);
}

const EFFECTIVE_FROM_PAST = '2010-01-01T00:00:00Z';

async function seedLimit(db, clientId, { dimensionCode, windowType, thresholdAmount, thresholdCount, scope }) {
  const now = new Date();
  const normalized = validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode, windowType, thresholdAmount, thresholdCount, scope, effectiveFrom: EFFECTIVE_FROM_PAST });
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
  const reconciliationRepository = new ReconciliationRepository(db.collection(RECONCILIATION_QUEUE_COLLECTION));
  const configCache = new ConfigCache(registryRepository, limitDefinitionRepository);
  const counterEngineService = new CounterEngineService(counterRepository, configCache);
  const reconciliationService = new ReconciliationService(counterRepository, transactionRepository, reconciliationRepository);
  const transactionService = new TransactionService(transactionRepository, configCache, counterEngineService, {
    instanceId: 'recon-test',
    reconciliationService,
  });
  return { transactionService, configCache, counterRepository, reconciliationRepository, reconciliationService };
}

describe('Counter reconciliation sweeper — STORY-05-02 (integration, real MongoDB)', () => {
  let client;
  let db;
  let harness;

  before(async () => {
    ({ client, db } = await connectTestDb('reconciliation'));
  });

  beforeEach(async () => {
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({});
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
    await db.collection(CLIENT_CONFIGS_COLLECTION).deleteMany({});
    await db.collection(LIMITS_COLLECTION).deleteMany({});
    await db.collection(RECONCILIATION_QUEUE_COLLECTION).deleteMany({});
    harness = buildHarness(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1/UAT 36: injected drift on a closed window is detected, alerted and corrected to the value derived from transactions', async () => {
    const clientId = 'CLIENT_RECON_A';
    await seedRegistry(db, clientId, [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const approved = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'RECON1', amount: 500 }, TZ, ['OUTWARD'], CLOSED_WINDOW_NOW);
    assert.equal(approved.body.data.status, 'APPROVED');
    const key = approved.body.data.appliedCounterKeys[0].key;

    // Inject drift: something (a lost failover write, an out-of-band script) left the physical document wrong.
    await db.collection(COUNTERS_COLLECTION).updateOne({ _id: key }, { $set: { amount: 999, count: 5 } });

    const summary = await harness.reconciliationService.sweepClosedWindows([clientId], new Date());
    const entry = summary.find((s) => s.key === key);
    assert.ok(entry, 'the closed-window sweep must have visited this key');
    assert.equal(entry.outcome.action, 'CORRECTED');
    assert.equal(entry.outcome.drifted, true);
    assert.equal(entry.outcome.actual.amount, 999);
    assert.equal(entry.outcome.expected.amount, 500);

    const corrected = await db.collection(COUNTERS_COLLECTION).findOne({ _id: key });
    assert.equal(corrected.amount, 500, 'closed-window drift must be corrected to the transactions-derived value');
    assert.equal(corrected.count, 1);
  });

  test('AC2: a floor-guard failure is queued for targeted reconciliation immediately, before any sweep runs', async () => {
    const clientId = 'CLIENT_RECON_B';
    await seedRegistry(db, clientId, [{ code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }, { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    const approved = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'RECON2', amount: 300, ucic: 'U1'  }, TZ, ['OUTWARD']);
    assert.equal(approved.body.data.status, 'APPROVED');
    const key = approved.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC').key;

    // Corrupt to a balance too small to absorb the recorded decrement — the floor guard must refuse it.
    await db.collection(COUNTERS_COLLECTION).updateOne({ _id: key }, { $set: { amount: 50, count: 1 } });

    const reversal = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'RECON2');
    assert.equal(reversal.httpStatus, 200);
    const reversedEntry = reversal.body.data.reversedCounters.find((r) => r.key === key);
    assert.equal(reversedEntry.floorGuardHeld, false);

    // No sweep or processQueue call has happened yet — the signal must already be there, queued synchronously by the reversal call itself.
    const queued = await db.collection(RECONCILIATION_QUEUE_COLLECTION).findOne({ clientId, counterKey: key });
    assert.ok(queued, 'a floor-guard failure must enqueue a drift signal immediately, not wait for a periodic sweep');
    assert.equal(queued.status, 'PENDING');
    assert.equal(queued.reason, 'REVERSAL_FLOOR_GUARD_FAILED');
    assert.equal(queued.sourceTransactionId, 'RECON2');

    const { processed } = await harness.reconciliationService.processQueue(new Date());
    assert.equal(processed, 1);
    const resolved = await db.collection(RECONCILIATION_QUEUE_COLLECTION).findOne({ _id: queued._id });
    assert.equal(resolved.status, 'RESOLVED');
  });

  test('AC3: drift on an open (not yet closed) window is alert-first — no auto-correction unless policy explicitly permits it', async () => {
    const clientId = 'CLIENT_RECON_C';
    await seedRegistry(db, clientId, [{ code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }, { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    // Real "now" — this window will not close for many hours; the counter document's expireAt is well in the future.
    const approved = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'RECON3', amount: 300, ucic: 'U1'  }, TZ, ['OUTWARD']);
    const key = approved.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC').key;
    await db.collection(COUNTERS_COLLECTION).updateOne({ _id: key }, { $set: { amount: 50, count: 1 } });

    await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'RECON3');
    const { results } = await harness.reconciliationService.processQueue(new Date());
    const outcome = results.find((r) => r.counterKey === key)?.outcome;
    assert.ok(outcome);
    assert.equal(outcome.action, 'ALERTED', 'an open window must never be silently auto-corrected by default policy');
    assert.equal(outcome.drifted, true);

    const doc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: key });
    assert.equal(doc.amount, 50, 'the live document must be left exactly as found — alert-only means no write');
  });

  test('AC4/AC5: a closed-window full pass verifies every counter and raises no drift for normal, undisturbed operation', async () => {
    const clientId = 'CLIENT_RECON_D';
    await seedRegistry(db, clientId, [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: warming({ DAILY_CALENDAR: {} }) },
      { code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
    ]);
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await seedLimit(db, clientId, { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
    await harness.configCache.warm([clientId]);

    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'RECON4A', amount: 200, ucic: 'U1' }, TZ, ['OUTWARD'], CLOSED_WINDOW_NOW);
    await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'RECON4B', amount: 150, ucic: 'U2' }, TZ, ['OUTWARD'], CLOSED_WINDOW_NOW);

    const liveDocs = await db.collection(COUNTERS_COLLECTION).find({ clientId }).toArray();
    assert.ok(liveDocs.length >= 2, 'GLOBAL (sharded) and at least two UCIC counters must exist');

    const summary = await harness.reconciliationService.sweepClosedWindows([clientId], new Date());
    assert.equal(summary.length, liveDocs.length, 'the full pass must visit every closed-window counter document that exists, not a sample');
    assert.ok(summary.every((s) => s.outcome.action === 'NONE' && s.outcome.drifted === false), 'undisturbed normal operation must never raise a drift alert');
  });

  test('rolling-tier drift signals are always alert-only, never auto-corrected, regardless of trigger', async () => {
    const clientId = 'CLIENT_RECON_E';
    const rollingKey = 'limit:CLIENT_RECON_E:OUTWARD:UCIC:DAILY_ROLLING:U1';
    await db.collection(COUNTERS_COLLECTION).insertOne({
      _id: rollingKey,
      clientId,
      buckets: { '2026-08-10-10': { a: 100, c: 1 } },
      createdAt: new Date(),
      updatedAt: new Date(),
      expireAt: new Date(Date.now() + 60000),
    });
    const doc = buildDriftSignalDocument({ clientId, counterKey: rollingKey, tier: 'rolling', sourceTransactionId: 'ROLL1', reason: 'COMPENSATION_FLOOR_GUARD_FAILED', now: new Date() });
    await harness.reconciliationRepository.enqueue(clientId, doc);

    const { results } = await harness.reconciliationService.processQueue(new Date());
    const outcome = results.find((r) => r.counterKey === rollingKey)?.outcome;
    assert.equal(outcome.action, 'ALERTED');

    const untouched = await db.collection(COUNTERS_COLLECTION).findOne({ _id: rollingKey });
    assert.deepEqual(untouched.buckets, { '2026-08-10-10': { a: 100, c: 1 } }, 'a rolling counter must never be rewritten by the sweeper');
  });

  test('a targeted signal whose document has since been TTL-cleaned is treated as moot, not as drift', async () => {
    const clientId = 'CLIENT_RECON_F';
    const goneKey = 'limit:CLIENT_RECON_F:OUTWARD:GLOBAL:DAILY_CALENDAR:2020-01-01';
    const doc = buildDriftSignalDocument({ clientId, counterKey: goneKey, tier: 'tier1', sourceTransactionId: 'GONE1', reason: 'COMPENSATION_FLOOR_GUARD_FAILED', now: new Date() });
    await harness.reconciliationRepository.enqueue(clientId, doc);

    const { results } = await harness.reconciliationService.processQueue(new Date());
    const outcome = results.find((r) => r.counterKey === goneKey)?.outcome;
    assert.equal(outcome.action, 'DOC_GONE');
    assert.equal(outcome.drifted, false);
  });
});
