import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndNormalizeRegistry,
  deriveWindowState,
  freezeRegistry,
  findDimension,
  isWindowEnforced,
} from '../../src/models/registry.model.js';
import { AppError } from '../../src/utils/AppError.js';
import { WINDOW_STATE } from '../../src/constants/index.js';

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-08-11T10:00:00Z');

function baseDimensions(overrides = {}) {
  return [
    { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: { DAILY_CALENDAR: {} }, ...overrides },
  ];
}

describe('validateAndNormalizeRegistry — STORY-02-01', () => {
  test('AC2: rejects a registry missing the mandatory GLOBAL dimension', () => {
    assert.throws(
      () =>
        validateAndNormalizeRegistry([{ code: 'UCIC', attributes: ['ucic'], windows: ['DAILY_CALENDAR'] }], {
          previousRegistry: null,
          timezone: TZ,
          now: NOW,
        }),
      (err) => err instanceof AppError && err.details.errors.some((e) => /GLOBAL/.test(e.message)),
    );
  });

  test('AC3: rejects a dimension declaring an attribute the engine cannot extract, naming dimension and attribute', () => {
    try {
      validateAndNormalizeRegistry(
        [...baseDimensions(), { code: 'BAD', attributes: ['notAnAttribute'], windows: ['DAILY_CALENDAR'] }],
        { previousRegistry: null, timezone: TZ, now: NOW },
      );
      assert.fail('expected rejection');
    } catch (err) {
      assert.ok(err instanceof AppError);
      const e = err.details.errors.find((x) => x.dimensionCode === 'BAD' && x.field === 'attributes');
      assert.ok(e, 'expected a named attributes error for dimension BAD');
      assert.match(e.message, /notAnAttribute/);
    }
  });

  test('rejects a duplicate dimensionCode within the same registry', () => {
    assert.throws(() =>
      validateAndNormalizeRegistry([...baseDimensions(), ...baseDimensions()], { previousRegistry: null, timezone: TZ, now: NOW }),
    );
  });

  test('rejects a dimension declaring PER_TXN explicitly (it is implicit and never declared)', () => {
    assert.throws(() =>
      validateAndNormalizeRegistry(
        [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: { PER_TXN: {} } }],
        { previousRegistry: null, timezone: TZ, now: NOW },
      ),
    );
  });

  test('STORY-02-02 DoD: rejects a dimension declaring no windows', () => {
    assert.throws(() =>
      validateAndNormalizeRegistry([{ code: 'GLOBAL', attributes: [], windows: {} }], { previousRegistry: null, timezone: TZ, now: NOW }),
    );
  });

  test('rejects granularity override on a non-rolling window', () => {
    assert.throws(() =>
      validateAndNormalizeRegistry(
        [{ code: 'GLOBAL', attributes: [], windows: { DAILY_CALENDAR: { granularity: 'HOUR' } } }],
        { previousRegistry: null, timezone: TZ, now: NOW },
      ),
    );
  });

  test('rejects hot dimension missing a valid shardFactor', () => {
    assert.throws(() =>
      validateAndNormalizeRegistry([{ code: 'GLOBAL', attributes: [], hot: true, windows: { DAILY_CALENDAR: {} } }], {
        previousRegistry: null,
        timezone: TZ,
        now: NOW,
      }),
    );
  });

  test('STORY-02-02 AC4: accepts the plain-array windows shorthand and normalises it to the canonical map', () => {
    const [dim] = validateAndNormalizeRegistry(
      [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: ['DAILY_CALENDAR', 'MONTHLY'] }],
      { previousRegistry: null, timezone: TZ, now: NOW },
    );
    assert.deepEqual(Object.keys(dim.windows).sort(), ['DAILY_CALENDAR', 'MONTHLY']);
  });

  test('accepts a valid registry and normalises attribute list', () => {
    const [dim] = validateAndNormalizeRegistry(baseDimensions({ attributes: ['channel'] }), {
      previousRegistry: null,
      timezone: TZ,
      now: NOW,
    });
    assert.deepEqual(dim.attributes, ['channel']);
  });
});

describe('window activation timing — STORY-02-03', () => {
  test('AC1/AC2: a newly declared window is PENDING_ACTIVATION until the next boundary', () => {
    const [dim] = validateAndNormalizeRegistry(baseDimensions(), { previousRegistry: null, timezone: TZ, now: NOW });
    assert.equal(deriveWindowState(dim.windows.DAILY_CALENDAR, NOW), WINDOW_STATE.PENDING_ACTIVATION);
    assert.equal(isWindowEnforced(dim.windows.DAILY_CALENDAR, NOW), false);
  });

  test('AC3: warming opt-in enforces immediately and is flagged WARMING until the natural boundary', () => {
    const [dim] = validateAndNormalizeRegistry(
      [{ code: 'GLOBAL', attributes: [], windows: { DAILY_CALENDAR: { warming: true } } }],
      { previousRegistry: null, timezone: TZ, now: NOW },
    );
    assert.equal(deriveWindowState(dim.windows.DAILY_CALENDAR, NOW), WINDOW_STATE.WARMING);
    assert.equal(isWindowEnforced(dim.windows.DAILY_CALENDAR, NOW), true);
  });

  test('AC4: once the boundary has passed, state is ACTIVE with no warming flag surviving', () => {
    const [dim] = validateAndNormalizeRegistry(
      [{ code: 'GLOBAL', attributes: [], windows: { DAILY_CALENDAR: { warming: true } } }],
      { previousRegistry: null, timezone: TZ, now: NOW },
    );
    const afterBoundary = new Date(dim.windows.DAILY_CALENDAR.boundaryAt.getTime() + 1000);
    assert.equal(deriveWindowState(dim.windows.DAILY_CALENDAR, afterBoundary), WINDOW_STATE.ACTIVE);

    const [nonWarmingDim] = validateAndNormalizeRegistry(baseDimensions(), { previousRegistry: null, timezone: TZ, now: NOW });
    const afterBoundary2 = new Date(nonWarmingDim.windows.DAILY_CALENDAR.boundaryAt.getTime() + 1000);
    assert.equal(deriveWindowState(nonWarmingDim.windows.DAILY_CALENDAR, afterBoundary2), WINDOW_STATE.ACTIVE);
  });

  test('a window carried over from a previous registry version keeps its original activation clock', () => {
    const first = validateAndNormalizeRegistry(baseDimensions(), { previousRegistry: null, timezone: TZ, now: NOW });
    const later = new Date(NOW.getTime() + 60 * 60 * 1000);
    const second = validateAndNormalizeRegistry(baseDimensions({ shardFactor: 64 }), {
      previousRegistry: { allowedDimensions: first },
      timezone: TZ,
      now: later,
    });
    assert.equal(second[0].windows.DAILY_CALENDAR.declaredAt.getTime(), first[0].windows.DAILY_CALENDAR.declaredAt.getTime());
    assert.equal(second[0].windows.DAILY_CALENDAR.boundaryAt.getTime(), first[0].windows.DAILY_CALENDAR.boundaryAt.getTime());
    assert.equal(second[0].shardFactor, 64, 'unrelated field changes still apply');
  });

  test('AC5: a de-activated window (removed from the registry) is simply absent — no state to check', () => {
    const [dim] = validateAndNormalizeRegistry(
      [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: { DAILY_CALENDAR: {} } }],
      { previousRegistry: null, timezone: TZ, now: NOW },
    );
    assert.equal(dim.windows.MONTHLY, undefined);
  });
});

describe('freezeRegistry — STORY-02-01 DoD (immutability)', () => {
  test('the frozen snapshot cannot be mutated, including nested fields', () => {
    const [dim] = validateAndNormalizeRegistry(baseDimensions(), { previousRegistry: null, timezone: TZ, now: NOW });
    const frozen = freezeRegistry({ _id: 'C', clientId: 'C', configVersion: 1, limitsVersion: 0, allowedDimensions: [dim] });

    assert.throws(() => {
      'use strict';
      frozen.configVersion = 999;
    }, TypeError);
    assert.throws(() => {
      'use strict';
      frozen.allowedDimensions[0].code = 'HACKED';
    }, TypeError);
    assert.throws(() => {
      'use strict';
      frozen.allowedDimensions[0].windows.DAILY_CALENDAR.warming = true;
    }, TypeError);
  });

  test('mutating the source object after freezing does not affect the frozen clone', () => {
    const source = { _id: 'C', clientId: 'C', configVersion: 1, limitsVersion: 0, allowedDimensions: [{ code: 'GLOBAL' }] };
    const frozen = freezeRegistry(source);
    source.allowedDimensions[0].code = 'MUTATED';
    assert.equal(frozen.allowedDimensions[0].code, 'GLOBAL');
  });
});

describe('findDimension', () => {
  test('returns null for an unknown dimensionCode', () => {
    assert.equal(findDimension({ allowedDimensions: [] }, 'GLOBAL'), null);
  });
});
