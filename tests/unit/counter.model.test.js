import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCounterKey, buildRollingKey, resolveWindowBucket } from '../../src/models/counter.model.js';
import { AppError } from '../../src/utils/AppError.js';

describe('buildCounterKey — STORY-03-01', () => {
  test('AC1: deterministic, leads with clientId, concatenates attribute values in declared order', () => {
    const key = buildCounterKey({
      clientId: 'CLIENT_A',
      dimensionCode: 'UCIC_CHANNEL',
      windowType: 'DAILY_CALENDAR',
      attributeValues: ['U12345', 'MOBILE'],
      windowBucket: '2026-08-10',
    });
    assert.equal(key, 'limit:CLIENT_A:UCIC_CHANNEL:DAILY_CALENDAR:U12345|MOBILE:2026-08-10');

    const again = buildCounterKey({
      clientId: 'CLIENT_A',
      dimensionCode: 'UCIC_CHANNEL',
      windowType: 'DAILY_CALENDAR',
      attributeValues: ['U12345', 'MOBILE'],
      windowBucket: '2026-08-10',
    });
    assert.equal(key, again, 'building the same inputs twice must be deterministic');
  });

  test('a zero-attribute dimension (GLOBAL) omits the attribute segment entirely, matching the BRD example', () => {
    const key = buildCounterKey({ clientId: 'CLIENT_A', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', attributeValues: [], windowBucket: '2026-08-10' });
    assert.equal(key, 'limit:CLIENT_A:GLOBAL:DAILY_CALENDAR:2026-08-10');
  });

  test('a shardIndex appends the #{n} suffix', () => {
    const key = buildCounterKey({ clientId: 'CLIENT_A', dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR', attributeValues: [], windowBucket: '2026-08-10', shardIndex: 7 });
    assert.equal(key, 'limit:CLIENT_A:GLOBAL:DAILY_CALENDAR:2026-08-10#7');
  });

  test('AC2: two clients with identical dimension and attribute values produce distinct, non-colliding keys', () => {
    const keyA = buildCounterKey({ clientId: 'CLIENT_A', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', attributeValues: ['U1'], windowBucket: '2026-08-10' });
    const keyB = buildCounterKey({ clientId: 'CLIENT_B', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', attributeValues: ['U1'], windowBucket: '2026-08-10' });
    assert.notEqual(keyA, keyB);
  });

  test('rejects an attribute value containing a reserved key-delimiter character', () => {
    assert.throws(
      () => buildCounterKey({ clientId: 'CLIENT_A', dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', attributeValues: ['bad:value'], windowBucket: '2026-08-10' }),
      AppError,
    );
  });

  test('routes DAILY_ROLLING to buildRollingKey instead', () => {
    assert.throws(() =>
      buildCounterKey({ clientId: 'CLIENT_A', dimensionCode: 'UCIC', windowType: 'DAILY_ROLLING', attributeValues: ['U1'], windowBucket: '2026-08-10' }),
    );
  });
});

describe('buildRollingKey', () => {
  test('has no windowBucket segment — one persistent document per entity', () => {
    const key = buildRollingKey({ clientId: 'CLIENT_A', dimensionCode: 'UCIC', attributeValues: ['U12345'] });
    assert.equal(key, 'limit:CLIENT_A:UCIC:DAILY_ROLLING:U12345');
  });
});

describe('resolveWindowBucket', () => {
  test('computes the bucket label and expireAt in the client timezone, expireAt after the boundary', () => {
    const now = new Date('2026-08-10T20:00:00Z');
    const { windowBucket, expireAt } = resolveWindowBucket('DAILY_CALENDAR', 'Asia/Kolkata', now);
    assert.equal(windowBucket, '2026-08-11');
    assert.ok(expireAt > now);
  });

  test('MONTHLY uses a year-month label', () => {
    const { windowBucket } = resolveWindowBucket('MONTHLY', 'UTC', new Date('2026-08-10T00:00:00Z'));
    assert.equal(windowBucket, '2026-08');
  });
});
