import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CounterEngineService } from '../../src/services/counterEngine.service.js';

function fakeCache(definitions) {
  return { getDefinitions: () => definitions };
}

const GLOBAL_PER_TXN_DEF = {
  dimensionCode: 'GLOBAL',
  windowType: 'PER_TXN',
  scope: null,
  isActive: true,
  effectiveFrom: new Date('2020-01-01'),
  effectiveTo: null,
  thresholdAmount: 10000000,
  definitionVersion: 3,
};

describe('CounterEngineService.checkPerTransaction — STORY-03-02 (Tier 0)', () => {
  test('AC1/zero-I/O: an amount above threshold is rejected purely from the cache, no repository call exists to make', () => {
    const engine = new CounterEngineService(null /* no repository needed — proves zero counter I/O */, fakeCache([GLOBAL_PER_TXN_DEF]));
    const result = engine.checkPerTransaction('CLIENT_A', { txnAmount: 10000001 });
    assert.equal(result.passed, false);
    assert.equal(result.breach.metric, 'AMOUNT');
  });

  test('AC2: an amount exactly at the threshold is approved (inclusive maxima)', () => {
    const engine = new CounterEngineService(null, fakeCache([GLOBAL_PER_TXN_DEF]));
    const result = engine.checkPerTransaction('CLIENT_A', { txnAmount: 10000000 });
    assert.equal(result.passed, true);
  });

  test('one paise over the threshold is rejected', () => {
    const engine = new CounterEngineService(null, fakeCache([GLOBAL_PER_TXN_DEF]));
    const result = engine.checkPerTransaction('CLIENT_A', { txnAmount: 10000001 });
    assert.equal(result.passed, false);
  });

  test('AC3: a missing Global Per-Transaction definition fails closed, not "unlimited"', () => {
    const engine = new CounterEngineService(null, fakeCache([]));
    const result = engine.checkPerTransaction('CLIENT_A', { txnAmount: 1 });
    assert.equal(result.passed, false);
    assert.equal(result.failClosed, true);
    assert.equal(result.reason, 'GLOBAL_PER_TXN_MISSING');
  });

  test('AC4: an over-threshold amount is rejected even with no other dimension configured at all', () => {
    const engine = new CounterEngineService(null, fakeCache([GLOBAL_PER_TXN_DEF]));
    const result = engine.checkPerTransaction('CLIENT_A', { txnAmount: 999999999 });
    assert.equal(result.passed, false);
  });

  test('an inactive Global Per-Transaction definition is treated as missing (fails closed)', () => {
    const engine = new CounterEngineService(null, fakeCache([{ ...GLOBAL_PER_TXN_DEF, isActive: false }]));
    const result = engine.checkPerTransaction('CLIENT_A', { txnAmount: 1 });
    assert.equal(result.failClosed, true);
  });

  test('BRD §2.3 "implicitly enabled for every dimension" — a non-GLOBAL dimension with no PER_TXN definition is Unlimited, not fail-closed', () => {
    const engine = new CounterEngineService(null, fakeCache([GLOBAL_PER_TXN_DEF]));
    const result = engine.checkPerTransaction('CLIENT_A', { dimensionCode: 'UCIC', attributeMap: { ucic: 'U1' }, txnAmount: 999999999 });
    assert.equal(result.passed, true);
    assert.equal(result.failClosed, false);
    assert.equal(result.definitionFound, false);
  });

  test('a non-GLOBAL dimension can carry its own optional PER_TXN cap', () => {
    const perUcicCap = { dimensionCode: 'UCIC', windowType: 'PER_TXN', scope: null, isActive: true, effectiveFrom: new Date('2020-01-01'), effectiveTo: null, thresholdAmount: 500, definitionVersion: 1 };
    const engine = new CounterEngineService(null, fakeCache([GLOBAL_PER_TXN_DEF, perUcicCap]));
    const result = engine.checkPerTransaction('CLIENT_A', { dimensionCode: 'UCIC', attributeMap: { ucic: 'U1' }, txnAmount: 600 });
    assert.equal(result.passed, false);
    assert.equal(result.definitionFound, true);
  });
});
