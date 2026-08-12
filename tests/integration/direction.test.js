import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearCollections, createApp, createTestClient } from './helpers/setup.js';
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
import { CLIENTS_COLLECTION } from '../../src/models/client.model.js';

const TZ = 'UTC';

async function seedRegistry(db, clientId, direction, dimensions) {
  const now = new Date();
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone: TZ, now });
  const existing = await db.collection(CLIENT_CONFIGS_COLLECTION).findOne({ _id: clientId });
  const directions = { ...(existing?.directions ?? {}), [direction]: { allowedDimensions: normalized } };
  const doc = buildRegistryDocument({ clientId, directions, configVersion: (existing?.configVersion ?? 0) + 1, limitsVersion: existing?.limitsVersion ?? 1, actor: 'test', now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).replaceOne({ _id: clientId }, doc, { upsert: true });
}

async function seedLimit(db, clientId, { direction, dimensionCode, windowType, thresholdAmount, thresholdCount, scope }) {
  const now = new Date();
  const normalized = validateLimitDefinitionCreate({ direction, dimensionCode, windowType, thresholdAmount, thresholdCount, scope });
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
  const transactionService = new TransactionService(transactionRepository, configCache, counterEngineService, { instanceId: 'dir-test' });
  return { transactionService, configCache, counterRepository };
}

describe('Direction scoping — EPIC-08 (integration, real MongoDB)', () => {
  let client;
  let db;
  let harness;

  before(async () => {
    ({ client, db } = await connectTestDb('direction_scoping'));
  });

  beforeEach(async () => {
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({});
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
    await db.collection(CLIENT_CONFIGS_COLLECTION).deleteMany({});
    await db.collection(LIMITS_COLLECTION).deleteMany({});
    await db.collection(CLIENTS_COLLECTION).deleteMany({});
    harness = buildHarness(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  describe('STORY-08-01 — direction resolution, validation and fail-closed gating', () => {
    test('AC1/UAT 49: a request with no direction field is rejected before any counter access, never defaulted to OUTWARD', async () => {
      const clientId = 'CLIENT_DIR_A';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      await assert.rejects(
        () => harness.transactionService.submit(clientId, { transactionId: 'NODIR1', amount: 100 }, TZ, ['OUTWARD']),
        (err) => err.code === 'DIRECTION_REQUIRED',
      );
      const counters = await db.collection(COUNTERS_COLLECTION).find({ clientId }).toArray();
      assert.equal(counters.length, 0, 'a request rejected for missing direction must never reach the counter path');
    });

    test('AC2/UAT 49: a request with an unrecognised direction value is rejected with an error naming the accepted values', async () => {
      const clientId = 'CLIENT_DIR_B';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      await assert.rejects(
        () => harness.transactionService.submit(clientId, { direction: 'SIDEWAYS', transactionId: 'BADDIR1', amount: 100 }, TZ, ['OUTWARD']),
        (err) => err.code === 'DIRECTION_UNRECOGNIZED' && /OUTWARD/.test(err.message) && /INWARD/.test(err.message),
      );
    });

    test('AC3/UAT 49: a direction that is structurally valid but not enabled for this client is rejected', async () => {
      const clientId = 'CLIENT_DIR_C';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      const res = await harness.transactionService.submit(clientId, { direction: 'INWARD', transactionId: 'NOTENABLED1', amount: 100 }, TZ, ['OUTWARD']);
      assert.equal(res.httpStatus, 403);
      assert.equal(res.body.error.code, 'DIRECTION_NOT_ENABLED');
      const counters = await db.collection(COUNTERS_COLLECTION).find({ clientId }).toArray();
      assert.equal(counters.length, 0);
    });

    test('AC4/AC5: a client with the direction enabled processes the transaction against that direction, and the resolved direction is recorded on the audit record', async () => {
      const clientId = 'CLIENT_DIR_D';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'ENABLED1', amount: 100 }, TZ, ['OUTWARD']);
      assert.equal(res.body.data.status, 'APPROVED');

      const doc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'ENABLED1' } });
      assert.equal(doc.direction, 'OUTWARD', 'the resolved direction must be recorded on the stored record');
    });
  });

  describe('STORY-08-02 — direction segment in counter keys and transaction identity', () => {
    test('AC1/UAT 45: an outward and an inward transaction, same client/dimension/attributes, increment separate counters and neither affects the other velocity', async () => {
      const clientId = 'CLIENT_DIR_E';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }, { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedRegistry(db, clientId, 'INWARD', [{ code: 'UCIC', attributes: ['ucic'], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }, { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      const outward = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'DIRSPLIT-OUT', amount: 500, ucic: 'U1' }, TZ, ['OUTWARD', 'INWARD']);
      const inward = await harness.transactionService.submit(clientId, { direction: 'INWARD', transactionId: 'DIRSPLIT-IN', amount: 300, ucic: 'U1' }, TZ, ['OUTWARD', 'INWARD']);
      assert.equal(outward.body.data.status, 'APPROVED');
      assert.equal(inward.body.data.status, 'APPROVED');

      const outwardKey = outward.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC').key;
      const inwardKey = inward.body.data.appliedCounterKeys.find((k) => k.dimensionCode === 'UCIC').key;
      assert.notEqual(outwardKey, inwardKey, 'the identical dimension/attribute combination must produce different keys per direction');

      const outwardDoc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: outwardKey });
      const inwardDoc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: inwardKey });
      assert.equal(outwardDoc.amount, 500, 'the outward counter must reflect only the outward transaction');
      assert.equal(inwardDoc.amount, 300, 'the inward counter must reflect only the inward transaction — neither velocity leaked into the other');
    });

    test('AC2: the direction segment sits immediately after the client identifier in the counter key', async () => {
      const clientId = 'CLIENT_DIR_F';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'KEYSHAPE1', amount: 10 }, TZ, ['OUTWARD']);
      const key = res.body.data.appliedCounterKeys[0].key;
      const segments = key.split(':');
      assert.equal(segments[1], clientId);
      assert.equal(segments[2], 'OUTWARD', 'direction must be the segment immediately after clientId');
    });

    test('AC3/UAT 50: an outward and an inward transaction carrying the identical Transaction ID are processed independently and neither resolves to the other stored decision', async () => {
      const clientId = 'CLIENT_DIR_G';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedRegistry(db, clientId, 'INWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      const [outward, inward] = await Promise.all([
        harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'SAME-ID', amount: 111 }, TZ, ['OUTWARD', 'INWARD']),
        harness.transactionService.submit(clientId, { direction: 'INWARD', transactionId: 'SAME-ID', amount: 222 }, TZ, ['OUTWARD', 'INWARD']),
      ]);
      assert.equal(outward.body.data.status, 'APPROVED');
      assert.equal(inward.body.data.status, 'APPROVED');

      const outwardDoc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'SAME-ID' } });
      const inwardDoc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'INWARD', transactionId: 'SAME-ID' } });
      assert.equal(outwardDoc.requestData.amount, 111);
      assert.equal(inwardDoc.requestData.amount, 222);

      const outwardKey = outward.body.data.appliedCounterKeys[0].key;
      const inwardKey = inward.body.data.appliedCounterKeys[0].key;
      assert.notEqual(outwardKey, inwardKey, 'the identical transactionId must never map to a shared counter key across directions');

      // The idempotency-replay path must resolve strictly to the matching direction, never cross over.
      const outwardReplay = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'SAME-ID', amount: 111 }, TZ, ['OUTWARD', 'INWARD']);
      assert.equal(outwardReplay.body.data.appliedCounterKeys[0].key, outwardKey);
      assert.equal(outwardReplay.body.data.appliedCounterKeys[0].key, outward.body.data.appliedCounterKeys[0].key);

      const outwardCounterDoc = await db.collection(COUNTERS_COLLECTION).findOne({ _id: outwardKey });
      assert.equal(outwardCounterDoc.amount, 111, 'the replay must not have double-incremented the outward counter');
    });

    test('AC4: every applied counter key entry records the direction actually used', async () => {
      const clientId = 'CLIENT_DIR_H';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'AUDITDIR1', amount: 10 }, TZ, ['OUTWARD']);
      assert.ok(res.body.data.appliedCounterKeys[0].key.includes(':OUTWARD:'), 'the applied key must embed the direction actually used');
    });

    test('AC5: the reversal endpoint accepts direction alongside the transaction identifier and locates the correct record', async () => {
      const clientId = 'CLIENT_DIR_I';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedRegistry(db, clientId, 'INWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'REVDIR-SAME', amount: 50 }, TZ, ['OUTWARD', 'INWARD']);
      await harness.transactionService.submit(clientId, { direction: 'INWARD', transactionId: 'REVDIR-SAME', amount: 75 }, TZ, ['OUTWARD', 'INWARD']);

      const reversedOutward = await harness.transactionService.reverseTransaction(clientId, 'OUTWARD', 'REVDIR-SAME', 'test');
      assert.equal(reversedOutward.httpStatus, 200);

      const inwardDoc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'INWARD', transactionId: 'REVDIR-SAME' } });
      assert.equal(inwardDoc.status, 'APPROVED', 'reversing the OUTWARD record must never touch the INWARD record sharing the same transactionId');

      const outwardDoc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId, direction: 'OUTWARD', transactionId: 'REVDIR-SAME' } });
      assert.equal(outwardDoc.status, 'REVERSED');
    });
  });

  describe('STORY-08-03 — per-direction dimension registry with backward-compatible loading', () => {
    test('AC1/UAT 46: divergent dimension sets per direction — each direction evaluates only its own dimensions and neither errors on the other absence', async () => {
      const clientId = 'CLIENT_DIR_J';
      await seedRegistry(db, clientId, 'OUTWARD', [
        { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
        { code: 'OUTWARD_ONLY', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
      ]);
      await seedRegistry(db, clientId, 'INWARD', [
        { code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
        { code: 'INWARD_ONLY', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) },
      ]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'OUTWARD_ONLY', windowType: 'DAILY_CALENDAR', thresholdAmount: 50 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      // Deliberately generous (unlike OUTWARD_ONLY's tight 50) — the point of this assertion is that
      // INWARD never even evaluates OUTWARD_ONLY, not that INWARD_ONLY happens to also reject.
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'INWARD_ONLY', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      // The outward-only dimension breaches for an outward transaction...
      const outwardBreach = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'DIVERGE-1', amount: 100 }, TZ, ['OUTWARD', 'INWARD']);
      assert.equal(outwardBreach.body.data.status, 'REJECTED');
      assert.equal(outwardBreach.body.data.rejection.dimensionCode, 'OUTWARD_ONLY');

      // ...but the same amount on the inward side never even sees OUTWARD_ONLY (it isn't in inward's registry) and approves.
      const inwardApproved = await harness.transactionService.submit(clientId, { direction: 'INWARD', transactionId: 'DIVERGE-2', amount: 100 }, TZ, ['OUTWARD', 'INWARD']);
      assert.equal(inwardApproved.body.data.status, 'APPROVED', 'inward must never error or reject on a dimension it never declared');
    });

    test('AC2: the same dimensionCode declared in both directions with different windows and thresholds enforces its own policy per direction', async () => {
      const clientId = 'CLIENT_DIR_K';
      await seedRegistry(db, clientId, 'OUTWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedRegistry(db, clientId, 'INWARD', [{ code: 'GLOBAL', attributes: [], hot: false, windows: warming({ DAILY_CALENDAR: {} }) }]);
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 100 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 100000 });
      await harness.configCache.warm([clientId]);

      const outwardBreach = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'POLICY-OUT', amount: 500 }, TZ, ['OUTWARD', 'INWARD']);
      assert.equal(outwardBreach.body.data.status, 'REJECTED', 'outward has a tight 100 threshold');

      const inwardApproved = await harness.transactionService.submit(clientId, { direction: 'INWARD', transactionId: 'POLICY-IN', amount: 500 }, TZ, ['OUTWARD', 'INWARD']);
      assert.equal(inwardApproved.body.data.status, 'APPROVED', 'inward has a generous 100000 threshold for the identical dimensionCode');
    });

    test('AC3/UAT 52: a legacy configuration with a top-level dimension list and no direction map normalises to an outward-only registry, unchanged outward enforcement', async () => {
      const clientId = 'CLIENT_DIR_L';
      const now = new Date();
      const normalized = validateAndNormalizeRegistry(
        [{ code: 'GLOBAL', attributes: [], hot: false, windows: { DAILY_CALENDAR: { warming: true } } }],
        { previousRegistry: null, timezone: TZ, now },
      );
      // Deliberately the pre-EPIC-08 shape: top-level allowedDimensions, no directions map at all.
      await db.collection(CLIENT_CONFIGS_COLLECTION).insertOne({
        _id: clientId,
        clientId,
        configVersion: 1,
        limitsVersion: 1,
        allowedDimensions: normalized,
        createdBy: 'legacy',
        updatedBy: 'legacy',
        createdAt: now,
        updatedAt: now,
      });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await seedLimit(db, clientId, { direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: 1000000 });
      await harness.configCache.warm([clientId]);

      const res = await harness.transactionService.submit(clientId, { direction: 'OUTWARD', transactionId: 'LEGACY1', amount: 100 }, TZ, ['OUTWARD']);
      assert.equal(res.body.data.status, 'APPROVED', 'a legacy top-level-allowedDimensions document must still enforce OUTWARD exactly as before EPIC-08');

      const stored = await db.collection(CLIENT_CONFIGS_COLLECTION).findOne({ _id: clientId });
      assert.ok(stored.allowedDimensions, 'the raw legacy document on disk is untouched — normalization happens at read time, not by migrating the document');
      assert.equal(stored.directions, undefined);
    });

    test('AC5: a direction cannot be enabled without a valid registry and a mandatory Global Per-Transaction limit for it', async () => {
      const { clientId } = await createTestClient(app());
      // Nothing configured for INWARD yet.
      const noRegistry = await request(app()).patch(`/clients/${clientId}/directions`).send({ enabledDirections: ['OUTWARD', 'INWARD'] });
      assert.equal(noRegistry.status, 400);
      assert.equal(noRegistry.body.error.code, 'DIRECTION_REGISTRY_INCOMPLETE');

      await request(app())
        .put(`/clients/${clientId}/dimensions`)
        .send({ direction: 'INWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });

      // Registry exists now, but still no GLOBAL PER_TXN limit for INWARD.
      const noLimit = await request(app()).patch(`/clients/${clientId}/directions`).send({ enabledDirections: ['OUTWARD', 'INWARD'] });
      assert.equal(noLimit.status, 400);
      assert.equal(noLimit.body.error.code, 'DIRECTION_GLOBAL_PER_TXN_MISSING');

      await request(app())
        .post(`/clients/${clientId}/limits`)
        .send({ direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });

      const enabled = await request(app()).patch(`/clients/${clientId}/directions`).send({ enabledDirections: ['OUTWARD', 'INWARD'] });
      assert.equal(enabled.status, 200);
      assert.deepEqual(enabled.body.data.client.enabledDirections.sort(), ['INWARD', 'OUTWARD']);
    });
  });

  describe('STORY-08-05 — direction-scoped configuration APIs and inert inward policy', () => {
    let httpApp;

    beforeEach(() => {
      httpApp = createApp(db);
    });

    test('AC1/UAT 51: a full inward registry and inward limit definitions created while inward is not enabled are stored, reported not effective, and have no effect on outward traffic', async () => {
      const { clientId } = await createTestClient(httpApp);
      await request(httpApp).put(`/clients/${clientId}/dimensions`).send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
      await request(httpApp).post(`/clients/${clientId}/limits`).send({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });

      const inwardRegistryRes = await request(httpApp)
        .put(`/clients/${clientId}/dimensions`)
        .send({ direction: 'INWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
      assert.equal(inwardRegistryRes.status, 200, 'the registry write itself succeeds — INWARD not being enabled yet does not block authoring it');

      const inwardLimitRes = await request(httpApp)
        .post(`/clients/${clientId}/limits`)
        .send({ direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 5000 });
      assert.equal(inwardLimitRes.status, 201);
      assert.equal(inwardLimitRes.body.data.effective, false);
      assert.equal(inwardLimitRes.body.warnings[0].code, 'DIRECTION_NOT_ENABLED');

      // Outward traffic is completely unaffected by the inert inward policy existing.
      const outwardRes = await request(httpApp)
        .post(`/clients/${clientId}/transactions`)
        .send({ direction: 'OUTWARD', transactionId: 'INERT-CHECK-1', amount: 100 });
      assert.equal(outwardRes.body.data.status, 'APPROVED');
    });

    test('AC2: the stored inward policy is enforced immediately once inward is enabled, with no code change and no redeployment', async () => {
      const { clientId } = await createTestClient(httpApp);
      await request(httpApp).put(`/clients/${clientId}/dimensions`).send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
      await request(httpApp).post(`/clients/${clientId}/limits`).send({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000000 });
      await request(httpApp).put(`/clients/${clientId}/dimensions`).send({ direction: 'INWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
      // A deliberately tight inward cap, authored ahead of time.
      await request(httpApp).post(`/clients/${clientId}/limits`).send({ direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 10 });

      const beforeEnable = await request(httpApp)
        .post(`/clients/${clientId}/transactions`)
        .send({ direction: 'INWARD', transactionId: 'PRE-ENABLE-1', amount: 100 });
      assert.equal(beforeEnable.status, 403, 'inward is not enabled yet — rejected before the policy is even consulted');

      await request(httpApp).patch(`/clients/${clientId}/directions`).send({ enabledDirections: ['OUTWARD', 'INWARD'] });

      const afterEnable = await request(httpApp)
        .post(`/clients/${clientId}/transactions`)
        .send({ direction: 'INWARD', transactionId: 'POST-ENABLE-1', amount: 100 });
      assert.equal(afterEnable.body.data.status, 'REJECTED', 'the previously-authored tight inward cap is now enforced immediately — no code change, no redeploy');
      assert.equal(afterEnable.body.data.rejection.dimensionCode, 'GLOBAL');
      assert.equal(afterEnable.body.data.rejection.windowType, 'PER_TXN');
      assert.equal(afterEnable.body.data.rejection.thresholdAmount, 10);
    });

    test('AC3: a limit definition carries a direction that is immutable thereafter', async () => {
      const { clientId } = await createTestClient(httpApp);
      await request(httpApp).put(`/clients/${clientId}/dimensions`).send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
      const createRes = await request(httpApp).post(`/clients/${clientId}/limits`).send({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 });

      const updateRes = await request(httpApp).put(`/clients/${clientId}/limits/${createRes.body.data._id}`).send({ direction: 'INWARD' });
      assert.equal(updateRes.status, 400);
      assert.ok(updateRes.body.error.details.errors.some((e) => e.field === 'direction'));
    });

    test('AC4: a list request filtered by direction returns only that direction\'s definitions, each with its effective flag', async () => {
      const { clientId } = await createTestClient(httpApp);
      await request(httpApp).put(`/clients/${clientId}/dimensions`).send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
      await request(httpApp).put(`/clients/${clientId}/dimensions`).send({ direction: 'INWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
      await request(httpApp).post(`/clients/${clientId}/limits`).send({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 });
      await request(httpApp).post(`/clients/${clientId}/limits`).send({ direction: 'INWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 2000 });

      const outwardList = await request(httpApp).get(`/clients/${clientId}/limits?direction=OUTWARD`);
      const inwardList = await request(httpApp).get(`/clients/${clientId}/limits?direction=INWARD`);
      assert.equal(outwardList.body.data.length, 1);
      assert.equal(outwardList.body.data[0].thresholdAmount, 1000);
      assert.equal(inwardList.body.data.length, 1);
      assert.equal(inwardList.body.data[0].thresholdAmount, 2000);
      assert.ok('effective' in outwardList.body.data[0]);
    });
  });

  function app() {
    return createApp(db);
  }
});
