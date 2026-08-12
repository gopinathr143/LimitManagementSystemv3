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
import { CLIENT_CONFIGS_COLLECTION } from '../../src/models/registry.model.js';
import { LIMITS_COLLECTION } from '../../src/models/limitDefinition.model.js';
import { validateAndNormalizeRegistry, buildRegistryDocument } from '../../src/models/registry.model.js';
import { buildLimitDefinitionDocument, validateLimitDefinitionCreate } from '../../src/models/limitDefinition.model.js';

const TZ = 'UTC';

async function seedClientConfig(db, clientId, { perTxnThreshold = 1000000000, dailyThreshold = 1000000000 } = {}) {
  const now = new Date();
  // warming:true so the freshly-declared window is enforced immediately rather than PENDING_ACTIVATION
  // until the next boundary (STORY-02-03) — the correct default, just not what these tests need.
  const dims = validateAndNormalizeRegistry(
    [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 4, windows: { DAILY_CALENDAR: { warming: true } } }],
    { previousRegistry: null, timezone: TZ, now },
  );
  const registryDoc = buildRegistryDocument({ clientId, directions: { OUTWARD: { allowedDimensions: dims } }, configVersion: 1, limitsVersion: 1, actor: 'test', now });
  await db.collection(CLIENT_CONFIGS_COLLECTION).insertOne(registryDoc);

  // GLOBAL's mandatory Per-Transaction cap (Tier 0, stateless).
  const perTxnNormalized = validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: perTxnThreshold });
  const perTxnDoc = buildLimitDefinitionDocument({ clientId, normalized: perTxnNormalized, actor: 'test', now });
  await db.collection(LIMITS_COLLECTION).insertOne({ ...perTxnDoc, clientId });

  // GLOBAL's DAILY_CALENDAR cap (Tier 2, since GLOBAL is declared hot) — without this, the declared
  // window has no limit definition and is "Undefined = Unlimited": no counter is written at all.
  const dailyNormalized = validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', thresholdAmount: dailyThreshold });
  const dailyDoc = buildLimitDefinitionDocument({ clientId, normalized: dailyNormalized, actor: 'test', now: new Date(now.getTime() + 1) });
  await db.collection(LIMITS_COLLECTION).insertOne({ ...dailyDoc, clientId });
}

function buildTransactionService(db, instanceId) {
  const transactionRepository = new TransactionRepository(db.collection(TRANSACTIONS_COLLECTION));
  const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
  const registryRepository = new RegistryRepository(db.collection(CLIENT_CONFIGS_COLLECTION));
  const limitDefinitionRepository = new LimitDefinitionRepository(db.collection(LIMITS_COLLECTION));
  const configCache = new ConfigCache(registryRepository, limitDefinitionRepository);
  const counterEngineService = new CounterEngineService(counterRepository, configCache);
  return { transactionService: new TransactionService(transactionRepository, configCache, counterEngineService, { instanceId }), configCache };
}

describe('TransactionService idempotency mutex — STORY-04-01 (integration, real MongoDB replica set)', () => {
  let client;
  let db;
  let transactionService;
  let configCache;

  before(async () => {
    ({ client, db } = await connectTestDb('transaction_idempotency'));
  });

  beforeEach(async () => {
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({});
    await db.collection(COUNTERS_COLLECTION).deleteMany({});
    await db.collection(CLIENT_CONFIGS_COLLECTION).deleteMany({});
    await db.collection(LIMITS_COLLECTION).deleteMany({});
    ({ transactionService, configCache } = buildTransactionService(db, 'instance-1'));
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1/UAT 30: many concurrent identical requests — exactly one runs the waterfall, counter incremented exactly once', async () => {
    await seedClientConfig(db, 'CLIENT_IDEM_A');
    await configCache.warm(['CLIENT_IDEM_A']);

    const CONCURRENT = 25;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, () => transactionService.submit('CLIENT_IDEM_A', { direction: 'OUTWARD', transactionId: 'TXN-1', amount: 500 }, TZ, ['OUTWARD'])),
    );

    // Every response must be either a 200 carrying the (shared) APPROVED decision — whether this
    // particular caller won the claim race or is replaying the winner's stored result verbatim,
    // the two are indistinguishable from the response alone by design (§3.1 step 3) — or a 409 for
    // a caller that observed the claim still PENDING.
    for (const r of results) {
      assert.ok(
        r.httpStatus === 409 || (r.httpStatus === 200 && r.body.data.status === 'APPROVED'),
        `unexpected response: ${JSON.stringify(r)}`,
      );
    }
    assert.ok(results.some((r) => r.httpStatus === 200), 'at least one request must have resolved to the approved decision');

    const globalCounters = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_IDEM_A' }).toArray();
    const totalAmount = globalCounters.reduce((sum, doc) => sum + (doc.amount ?? 0), 0);
    const totalCount = globalCounters.reduce((sum, doc) => sum + (doc.count ?? 0), 0);
    assert.equal(totalAmount, 500, 'the counter must reflect exactly one transaction, not one per concurrent request');
    assert.equal(totalCount, 1);

    const storedTxn = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId: 'CLIENT_IDEM_A', direction: 'OUTWARD', transactionId: 'TXN-1' } });
    assert.equal(storedTxn.status, 'APPROVED');
  });

  test('AC2/UAT 8: a sequential repeat of the same transaction returns the stored result with no re-validation', async () => {
    await seedClientConfig(db, 'CLIENT_IDEM_B');
    await configCache.warm(['CLIENT_IDEM_B']);

    const first = await transactionService.submit('CLIENT_IDEM_B', { direction: 'OUTWARD', transactionId: 'TXN-2', amount: 700 }, TZ, ['OUTWARD']);
    assert.equal(first.body.data.status, 'APPROVED');

    const second = await transactionService.submit('CLIENT_IDEM_B', { direction: 'OUTWARD', transactionId: 'TXN-2', amount: 700 }, TZ, ['OUTWARD']);
    assert.equal(second.httpStatus, 200);
    assert.equal(second.body.data.status, 'APPROVED');

    const counters = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_IDEM_B' }).toArray();
    const totalAmount = counters.reduce((sum, doc) => sum + (doc.amount ?? 0), 0);
    assert.equal(totalAmount, 700, 'the replay must not increment the counter a second time');
  });

  test('AC3: a request finding the claim still PENDING (simulated) receives 409 and never reaches the counter path', async () => {
    await seedClientConfig(db, 'CLIENT_IDEM_C');
    await configCache.warm(['CLIENT_IDEM_C']);

    // Manually seed a PENDING claim to simulate a genuinely in-flight peer request.
    await db.collection(TRANSACTIONS_COLLECTION).insertOne({
      _id: { clientId: 'CLIENT_IDEM_C', direction: 'OUTWARD', transactionId: 'TXN-3' },
      clientId: 'CLIENT_IDEM_C',
      direction: 'OUTWARD',
      transactionId: 'TXN-3',
      status: 'PENDING',
      requestData: { amount: 100 },
      claimedAt: new Date(),
      updatedAt: new Date(),
      instanceId: 'other-instance',
    });

    const res = await transactionService.submit('CLIENT_IDEM_C', { direction: 'OUTWARD', transactionId: 'TXN-3', amount: 100 }, TZ, ['OUTWARD']);
    assert.equal(res.httpStatus, 409);

    const counters = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_IDEM_C' }).toArray();
    assert.equal(counters.length, 0, 'no counter access must occur for a request that loses the claim race');
  });

  test('AC4: two different clients using the same transactionId are processed independently', async () => {
    await seedClientConfig(db, 'CLIENT_IDEM_D1');
    await seedClientConfig(db, 'CLIENT_IDEM_D2');
    await configCache.warm(['CLIENT_IDEM_D1', 'CLIENT_IDEM_D2']);

    const [r1, r2] = await Promise.all([
      transactionService.submit('CLIENT_IDEM_D1', { direction: 'OUTWARD', transactionId: 'SHARED-TXN', amount: 111 }, TZ, ['OUTWARD']),
      transactionService.submit('CLIENT_IDEM_D2', { direction: 'OUTWARD', transactionId: 'SHARED-TXN', amount: 222 }, TZ, ['OUTWARD']),
    ]);

    assert.equal(r1.body.data.status, 'APPROVED');
    assert.equal(r2.body.data.status, 'APPROVED');

    const doc1 = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId: 'CLIENT_IDEM_D1', direction: 'OUTWARD', transactionId: 'SHARED-TXN' } });
    const doc2 = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId: 'CLIENT_IDEM_D2', direction: 'OUTWARD', transactionId: 'SHARED-TXN' } });
    assert.equal(doc1.requestData.amount, 111);
    assert.equal(doc2.requestData.amount, 222);

    const counters1 = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_IDEM_D1' }).toArray();
    const counters2 = await db.collection(COUNTERS_COLLECTION).find({ clientId: 'CLIENT_IDEM_D2' }).toArray();
    assert.equal(counters1.reduce((s, d) => s + (d.amount ?? 0), 0), 111);
    assert.equal(counters2.reduce((s, d) => s + (d.amount ?? 0), 0), 222);
  });

  test('AC5: on completion the claim is updated in place with the final status and applied counter keys', async () => {
    await seedClientConfig(db, 'CLIENT_IDEM_E');
    await configCache.warm(['CLIENT_IDEM_E']);

    await transactionService.submit('CLIENT_IDEM_E', { direction: 'OUTWARD', transactionId: 'TXN-5', amount: 42 }, TZ, ['OUTWARD']);
    const doc = await db.collection(TRANSACTIONS_COLLECTION).findOne({ _id: { clientId: 'CLIENT_IDEM_E', direction: 'OUTWARD', transactionId: 'TXN-5' } });
    assert.equal(doc.status, 'APPROVED');
    assert.ok(Array.isArray(doc.appliedCounterKeys) && doc.appliedCounterKeys.length > 0);
    assert.ok(doc.resolvedAt);
  });
});
