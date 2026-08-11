import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndNormalizeRegistry, resolveShardFactorForRead, resolveShardFactorForWrite } from '../../src/models/registry.model.js';

const TZ = 'UTC';

function hotGlobal(shardFactor) {
  return [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor, windows: { DAILY_CALENDAR: {} } }];
}

describe('Safe shardFactor change semantics — STORY-03-05', () => {
  test('a brand-new hot window gets an immediate single-entry history', () => {
    const now = new Date('2026-08-10T10:00:00Z');
    const [dim] = validateAndNormalizeRegistry(hotGlobal(32), { previousRegistry: null, timezone: TZ, now });
    assert.deepEqual(dim.windows.DAILY_CALENDAR.shardFactorHistory, [{ value: 32, effectiveAt: now }]);
  });

  test('AC1/AC3: a decrease is scheduled for the next boundary, never immediate', () => {
    const t1 = new Date('2026-08-10T10:00:00Z');
    const [d1] = validateAndNormalizeRegistry(hotGlobal(32), { previousRegistry: null, timezone: TZ, now: t1 });

    const t2 = new Date('2026-08-10T14:00:00Z');
    const [d2] = validateAndNormalizeRegistry(hotGlobal(16), { previousRegistry: { allowedDimensions: [d1] }, timezone: TZ, now: t2 });

    const history = d2.windows.DAILY_CALENDAR.shardFactorHistory;
    assert.equal(history.length, 2);
    assert.equal(history[1].value, 16);
    assert.ok(history[1].effectiveAt > t2, 'the decrease must not be effective yet');
    assert.equal(history[1].effectiveAt.getTime(), d2.windows.DAILY_CALENDAR.boundaryAt.getTime());

    // Before the boundary, both reads and writes still use the old (larger) value.
    assert.equal(resolveShardFactorForWrite(d2.windows.DAILY_CALENDAR, t2), 32);
    assert.equal(resolveShardFactorForRead(d2.windows.DAILY_CALENDAR, t2), 32);
  });

  test('an increase is effective immediately', () => {
    const t1 = new Date('2026-08-10T10:00:00Z');
    const [d1] = validateAndNormalizeRegistry(hotGlobal(32), { previousRegistry: null, timezone: TZ, now: t1 });

    const t2 = new Date('2026-08-10T14:00:00Z');
    const [d2] = validateAndNormalizeRegistry(hotGlobal(64), { previousRegistry: { allowedDimensions: [d1] }, timezone: TZ, now: t2 });

    assert.equal(resolveShardFactorForWrite(d2.windows.DAILY_CALENDAR, t2), 64);
    assert.equal(resolveShardFactorForRead(d2.windows.DAILY_CALENDAR, t2), 64);
  });

  test('AC2: after the boundary passes, the reader still sums max(historical, current) — never drops below the largest value ever in force', () => {
    const t1 = new Date('2026-08-10T10:00:00Z');
    const [d1] = validateAndNormalizeRegistry(hotGlobal(32), { previousRegistry: null, timezone: TZ, now: t1 });
    const t2 = new Date('2026-08-10T14:00:00Z');
    const [d2] = validateAndNormalizeRegistry(hotGlobal(16), { previousRegistry: { allowedDimensions: [d1] }, timezone: TZ, now: t2 });

    const afterBoundary = new Date(d2.windows.DAILY_CALENDAR.boundaryAt.getTime() + 1000);
    assert.equal(resolveShardFactorForWrite(d2.windows.DAILY_CALENDAR, afterBoundary), 16, 'new writes pick from the smaller, now-current factor');
    assert.equal(resolveShardFactorForRead(d2.windows.DAILY_CALENDAR, afterBoundary), 32, 'reads must never orphan the buckets #16-31 that may still hold balance');
  });

  test('an unchanged shardFactor resubmission leaves history untouched (no spurious entries)', () => {
    const t1 = new Date('2026-08-10T10:00:00Z');
    const [d1] = validateAndNormalizeRegistry(hotGlobal(32), { previousRegistry: null, timezone: TZ, now: t1 });
    const t2 = new Date('2026-08-10T14:00:00Z');
    const [d2] = validateAndNormalizeRegistry(hotGlobal(32), { previousRegistry: { allowedDimensions: [d1] }, timezone: TZ, now: t2 });
    assert.equal(d2.windows.DAILY_CALENDAR.shardFactorHistory.length, 1);
  });

  test('AC4-precursor: the write-side resolver is exactly what a reversal must record and later reuse', () => {
    const t1 = new Date('2026-08-10T10:00:00Z');
    const [d1] = validateAndNormalizeRegistry(hotGlobal(8), { previousRegistry: null, timezone: TZ, now: t1 });
    const shardFactorAtApproval = resolveShardFactorForWrite(d1.windows.DAILY_CALENDAR, t1);
    assert.equal(shardFactorAtApproval, 8);
    // A later shardFactor change must not retroactively alter what was recorded at approval time.
    const t2 = new Date('2026-08-10T14:00:00Z');
    validateAndNormalizeRegistry(hotGlobal(4), { previousRegistry: { allowedDimensions: [d1] }, timezone: TZ, now: t2 });
    assert.equal(shardFactorAtApproval, 8, 'the value captured at approval time is immutable once read');
  });
});
