import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLimitDefinitionCreate,
  validateLimitDefinitionUpdate,
  evaluateEffectiveness,
  findApplicableDefinition,
} from '../../src/models/limitDefinition.model.js';
import { validateAndNormalizeRegistry } from '../../src/models/registry.model.js';
import { AppError } from '../../src/utils/AppError.js';

const NOW = new Date('2026-08-11T10:00:00Z');

describe('validateLimitDefinitionCreate — STORY-02-04, BRD §2.3.2 (integers, no floats)', () => {
  test('accepts a minimal valid PER_TXN definition (amount-only)', () => {
    const normalized = validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 500000 });
    assert.equal(normalized.currency, 'INR');
    assert.equal(normalized.thresholdCount, null);
    assert.equal(normalized.direction, 'OUTWARD');
  });

  test('STORY-08-05 AC3: rejects a missing or unrecognised direction', () => {
    assert.throws(() => validateLimitDefinitionCreate({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 500000 }), AppError);
    assert.throws(() => validateLimitDefinitionCreate({ direction: 'SIDEWAYS', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 500000 }), AppError);
  });

  test('rejects PER_TXN with a thresholdCount (amount-only per §2.3 item 1)', () => {
    assert.throws(
      () => validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000, thresholdCount: 5 }),
      AppError,
    );
  });

  test('rejects a definition with neither thresholdAmount nor thresholdCount', () => {
    assert.throws(() => validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR' }), AppError);
  });

  test('rejects a non-integer (float) threshold', () => {
    assert.throws(
      () => validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 100.5 }),
      AppError,
    );
  });

  test('rejects a currency other than INR', () => {
    assert.throws(
      () => validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 100, currency: 'USD' }),
      AppError,
    );
  });

  test('rejects an unknown windowType', () => {
    assert.throws(
      () => validateLimitDefinitionCreate({ direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'YEARLY', thresholdAmount: 100 }),
      AppError,
    );
  });

  test('AC5: accepts a future effectiveFrom; rejects effectiveTo before effectiveFrom', () => {
    assert.doesNotThrow(() =>
      validateLimitDefinitionCreate({
        direction: 'OUTWARD',
        dimensionCode: 'UCIC',
        windowType: 'DAILY_CALENDAR',
        thresholdAmount: 100,
        effectiveFrom: '2027-01-01T00:00:00Z',
      }),
    );
    assert.throws(() =>
      validateLimitDefinitionCreate({
        direction: 'OUTWARD',
        dimensionCode: 'UCIC',
        windowType: 'DAILY_CALENDAR',
        thresholdAmount: 100,
        effectiveFrom: '2027-01-01T00:00:00Z',
        effectiveTo: '2026-01-01T00:00:00Z',
      }),
    );
  });

  test('accepts a scope override map', () => {
    const normalized = validateLimitDefinitionCreate({
      direction: 'OUTWARD',
      dimensionCode: 'UCIC',
      windowType: 'DAILY_CALENDAR',
      thresholdAmount: 100,
      scope: { ucic: 'U12345' },
    });
    assert.deepEqual(normalized.scope, { ucic: 'U12345' });
  });
});

describe('validateLimitDefinitionUpdate', () => {
  test('rejects an attempt to change dimensionCode, windowType or scope', () => {
    assert.throws(() => validateLimitDefinitionUpdate({ dimensionCode: 'OTHER' }), AppError);
    assert.throws(() => validateLimitDefinitionUpdate({ windowType: 'MONTHLY' }), AppError);
    assert.throws(() => validateLimitDefinitionUpdate({ scope: { ucic: 'X' } }), AppError);
  });

  test('accepts a threshold-only update', () => {
    const update = validateLimitDefinitionUpdate({ thresholdAmount: 200 });
    assert.deepEqual(update, { thresholdAmount: 200 });
  });

  test('rejects an empty update payload', () => {
    assert.throws(() => validateLimitDefinitionUpdate({}), AppError);
  });
});

describe('evaluateEffectiveness — STORY-02-05', () => {
  const [registrySnapshotDim] = validateAndNormalizeRegistry(
    [
      { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: { DAILY_CALENDAR: {} } },
      { code: 'UCIC', attributes: ['ucic'], windows: { DAILY_CALENDAR: {} } },
    ],
    { previousRegistry: null, timezone: 'UTC', now: NOW },
  );
  const registrySnapshot = { allowedDimensions: [registrySnapshotDim, { code: 'UCIC', windows: { DAILY_CALENDAR: registrySnapshotDim.windows.DAILY_CALENDAR } }] };

  test('AC1: dimension not in registry -> DIMENSION_NOT_REGISTERED', () => {
    const def = { dimensionCode: 'NOT_REGISTERED', windowType: 'DAILY_CALENDAR', isActive: true, effectiveFrom: NOW, effectiveTo: null };
    const result = evaluateEffectiveness(def, registrySnapshot, NOW);
    assert.equal(result.effective, false);
    assert.equal(result.reason, 'DIMENSION_NOT_REGISTERED');
  });

  test('AC2: window not declared for an otherwise registered dimension -> WINDOW_NOT_DECLARED', () => {
    const def = { dimensionCode: 'GLOBAL', windowType: 'MONTHLY', isActive: true, effectiveFrom: NOW, effectiveTo: null };
    const result = evaluateEffectiveness(def, registrySnapshot, NOW);
    assert.equal(result.reason, 'WINDOW_NOT_DECLARED');
  });

  test('a declared but not-yet-boundary-crossed window -> WINDOW_PENDING_ACTIVATION', () => {
    const def = { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', isActive: true, effectiveFrom: NOW, effectiveTo: null };
    const result = evaluateEffectiveness(def, registrySnapshot, NOW);
    assert.equal(result.reason, 'WINDOW_PENDING_ACTIVATION');
  });

  test('PER_TXN is effective as soon as the dimension is registered, independent of windows', () => {
    const def = { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', isActive: true, effectiveFrom: NOW, effectiveTo: null };
    const result = evaluateEffectiveness(def, registrySnapshot, NOW);
    assert.equal(result.effective, true);
  });

  test('an inactive definition is not effective', () => {
    const boundaryPassed = new Date(registrySnapshotDim.windows.DAILY_CALENDAR.boundaryAt.getTime() + 1000);
    const def = { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', isActive: false, effectiveFrom: NOW, effectiveTo: null };
    const result = evaluateEffectiveness(def, registrySnapshot, boundaryPassed);
    assert.equal(result.reason, 'DEFINITION_INACTIVE');
  });

  test('AC5 (STORY-02-04): a future effectiveFrom is not yet effective', () => {
    const boundaryPassed = new Date(registrySnapshotDim.windows.DAILY_CALENDAR.boundaryAt.getTime() + 1000);
    const future = new Date(boundaryPassed.getTime() + 100000);
    const def = { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', isActive: true, effectiveFrom: future, effectiveTo: null };
    const result = evaluateEffectiveness(def, registrySnapshot, boundaryPassed);
    assert.equal(result.reason, 'NOT_YET_EFFECTIVE_DATE');
  });

  test('once registered, declared and past its boundary, the definition is effective', () => {
    const boundaryPassed = new Date(registrySnapshotDim.windows.DAILY_CALENDAR.boundaryAt.getTime() + 1000);
    const def = { dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', isActive: true, effectiveFrom: NOW, effectiveTo: null };
    const result = evaluateEffectiveness(def, registrySnapshot, boundaryPassed);
    assert.equal(result.effective, true);
    assert.equal(result.reason, null);
  });
});

describe('findApplicableDefinition — STORY-02-04 AC2 (scope precedence) / STORY-08-05 (direction filter)', () => {
  const wildcard = { direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', scope: null, isActive: true, effectiveFrom: NOW, effectiveTo: null, thresholdAmount: 100 };
  const scoped = { direction: 'OUTWARD', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', scope: { ucic: 'U12345' }, isActive: true, effectiveFrom: NOW, effectiveTo: null, thresholdAmount: 999 };

  test('a scope override takes precedence over the wildcard default for matching attribute values', () => {
    const result = findApplicableDefinition([wildcard, scoped], 'OUTWARD', 'UCIC', 'DAILY_CALENDAR', { ucic: 'U12345' }, NOW);
    assert.equal(result.thresholdAmount, 999);
  });

  test('falls back to the wildcard default when no scope matches', () => {
    const result = findApplicableDefinition([wildcard, scoped], 'OUTWARD', 'UCIC', 'DAILY_CALENDAR', { ucic: 'U_OTHER' }, NOW);
    assert.equal(result.thresholdAmount, 100);
  });

  test('returns null (Unlimited) when nothing matches', () => {
    const result = findApplicableDefinition([scoped], 'OUTWARD', 'UCIC', 'DAILY_CALENDAR', { ucic: 'U_OTHER' }, NOW);
    assert.equal(result, null);
  });

  test('excludes an inactive or not-yet-effective definition', () => {
    const inactive = { ...wildcard, isActive: false };
    const notYetEffective = { ...wildcard, effectiveFrom: new Date(NOW.getTime() + 100000) };
    assert.equal(findApplicableDefinition([inactive], 'OUTWARD', 'UCIC', 'DAILY_CALENDAR', {}, NOW), null);
    assert.equal(findApplicableDefinition([notYetEffective], 'OUTWARD', 'UCIC', 'DAILY_CALENDAR', {}, NOW), null);
  });

  test('excludes a definition past its effectiveTo', () => {
    const expired = { ...wildcard, effectiveTo: new Date(NOW.getTime() - 1000) };
    assert.equal(findApplicableDefinition([expired], 'OUTWARD', 'UCIC', 'DAILY_CALENDAR', {}, NOW), null);
  });

  test('STORY-08-05: excludes a definition belonging to a different direction, even if otherwise identical', () => {
    assert.equal(findApplicableDefinition([wildcard], 'INWARD', 'UCIC', 'DAILY_CALENDAR', {}, NOW), null);
  });
});
