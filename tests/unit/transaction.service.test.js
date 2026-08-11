import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TransactionService } from '../../src/services/transaction.service.js';
import { validateAndNormalizeRegistry } from '../../src/models/registry.model.js';

const TZ = 'UTC';
const NOW = new Date();

function registryWith(dimensions) {
  const normalized = validateAndNormalizeRegistry(dimensions, { previousRegistry: null, timezone: TZ, now: NOW });
  return { allowedDimensions: normalized };
}

function warmDim(code, attributes, windows, extra = {}) {
  const windowsWithWarming = Object.fromEntries(Object.entries(windows).map(([k, v]) => [k, { ...v, warming: true }]));
  return { code, attributes, windows: windowsWithWarming, ...extra };
}

class FakeTransactionRepository {
  constructor() {
    this.docs = new Map();
    this.resolveShouldThrow = false;
    this.resolveCalls = [];
  }
  async claim(clientId, doc) {
    const key = `${clientId}:${doc.transactionId}`;
    if (this.docs.has(key)) {
      return { claimed: false, existing: this.docs.get(key) };
    }
    this.docs.set(key, doc);
    return { claimed: true, doc };
  }
  async resolve(clientId, transactionId, setFields) {
    this.resolveCalls.push({ clientId, transactionId, setFields });
    if (this.resolveShouldThrow) {
      const err = new Error('simulated resolve failure');
      throw err;
    }
    const key = `${clientId}:${transactionId}`;
    const existing = this.docs.get(key);
    this.docs.set(key, { ...existing, ...setFields });
    return { matchedCount: 1 };
  }
}

function fakeConfigCache(registry, definitions = []) {
  return { getRegistry: () => registry, getDefinitions: () => definitions };
}

describe('TransactionService — STORY-04-04 compensating saga edge cases (unit, fakes)', () => {
  test('AC2: a resolve-write failure after counters were incremented compensates everything and returns SYSTEM_FAILURE', async () => {
    const registry = registryWith([warmDim('GLOBAL', [], { DAILY_CALENDAR: {} }, { hot: true, shardFactor: 4 })]);
    const definitions = [
      { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 1000000, definitionVersion: 1 },
      { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 1000000, definitionVersion: 1 },
    ];

    const transactionRepository = new FakeTransactionRepository();
    let compensated = null;
    const counterEngineService = {
      checkPerTransaction: () => ({ passed: true, failClosed: false, definitionFound: true }),
      checkAndIncrementTier2: async () => ({ passed: true, appliedKey: 'limit:CLIENT_A:GLOBAL:DAILY_CALENDAR:2026#0', amountDelta: 500, countDelta: 1, shardIndex: 0, shardFactorUsed: 4 }),
      compensateTier1: async (clientId, key, delta) => {
        compensated = { clientId, key, delta };
        return { floorGuardHeld: true };
      },
    };

    transactionRepository.resolveShouldThrow = true;
    const service = new TransactionService(transactionRepository, fakeConfigCache(registry, definitions), counterEngineService, { instanceId: 'unit-test' });

    const res = await service.submit('CLIENT_A', { transactionId: 'SYS-FAIL-1', amount: 500 }, TZ, NOW);

    assert.equal(res.httpStatus, 500);
    assert.equal(res.body.error.code, 'SYSTEM_FAILURE');
    assert.ok(compensated, 'the applied counter must have been compensated');
    assert.equal(compensated.key, 'limit:CLIENT_A:GLOBAL:DAILY_CALENDAR:2026#0');
    // Two resolve attempts: the failing real resolve, then the best-effort SYSTEM_FAILURE marker.
    assert.equal(transactionRepository.resolveCalls.length, 2);
    assert.equal(transactionRepository.resolveCalls[1].setFields.status, 'SYSTEM_FAILURE');
  });

  test('AC5: a compensation whose floor guard fails is logged, not thrown — resolution still completes', async () => {
    const registry = registryWith([
      warmDim('GLOBAL', [], { DAILY_CALENDAR: {} }, { hot: true, shardFactor: 4 }),
      warmDim('UCIC', ['ucic'], { DAILY_CALENDAR: {} }),
    ]);
    const definitions = [
      { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 1000000, definitionVersion: 1 },
      { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 1000000, definitionVersion: 1 },
      { dimensionCode: 'UCIC', windowType: 'PER_TXN', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 1000000, definitionVersion: 1 },
      { dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 10, definitionVersion: 1 }, // breaches
    ];

    const transactionRepository = new FakeTransactionRepository();
    const counterEngineService = {
      checkPerTransaction: () => ({ passed: true, failClosed: false, definitionFound: true }),
      checkAndIncrementTier2: async () => ({ passed: true, appliedKey: 'limit:CLIENT_B:GLOBAL:DAILY_CALENDAR:2026#0', amountDelta: 500, countDelta: 1 }),
      checkAndIncrementTier1: async () => ({ passed: false, breach: { metrics: ['AMOUNT'], currentAmount: 500, currentCount: 1, thresholdAmount: 10 } }),
      compensateTier1: async () => ({ floorGuardHeld: false }), // simulated compensation failure
    };

    const service = new TransactionService(transactionRepository, fakeConfigCache(registry, definitions), counterEngineService, { instanceId: 'unit-test' });
    const res = await service.submit('CLIENT_B', { transactionId: 'COMP-FAIL-1', amount: 500, ucic: 'U1' }, TZ, NOW);

    assert.equal(res.body.data.status, 'REJECTED');
    assert.equal(res.body.data.rejection.dimensionCode, 'UCIC');
  });

  test('a limit breach is a returned decision, never a thrown error — the request completes with no exception propagating', async () => {
    const registry = registryWith([warmDim('GLOBAL', [], { DAILY_CALENDAR: {} }, { hot: true, shardFactor: 4 })]);
    const definitions = [
      { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 1000000, definitionVersion: 1 },
      { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', scope: null, isActive: true, effectiveFrom: new Date(0), effectiveTo: null, thresholdAmount: 10, definitionVersion: 1 },
    ];
    const transactionRepository = new FakeTransactionRepository();
    const counterEngineService = {
      checkPerTransaction: () => ({ passed: true, failClosed: false, definitionFound: true }),
      checkAndIncrementTier2: async () => ({ passed: false, breach: { metrics: ['AMOUNT'], currentAmount: 0, currentCount: 0, thresholdAmount: 10 } }),
    };
    const service = new TransactionService(transactionRepository, fakeConfigCache(registry, definitions), counterEngineService, { instanceId: 'unit-test' });

    await assert.doesNotReject(() => service.submit('CLIENT_C', { transactionId: 'BREACH-1', amount: 500 }, TZ, NOW));
  });
});
