import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildRollingPipeline, buildShardedRollingPipeline } from '../../src/models/rollingCounter.model.js';
import { rollingBucketLabel, rollingHorizonLabel } from '../../src/utils/windowBoundary.js';

describe('rollingBucketLabel / rollingHorizonLabel', () => {
  test('HOUR granularity produces a zero-padded, lexicographically-sortable label', () => {
    const label = rollingBucketLabel(new Date('2026-08-05T07:03:00Z'), 'HOUR');
    assert.equal(label, '2026-08-05-07');
  });

  test('MINUTE granularity includes minutes', () => {
    const label = rollingBucketLabel(new Date('2026-08-05T07:03:00Z'), 'MINUTE');
    assert.equal(label, '2026-08-05-07-03');
  });

  test('the horizon label is exactly 24h behind and sorts before the current label', () => {
    const now = new Date('2026-08-10T12:00:00Z');
    const current = rollingBucketLabel(now, 'HOUR');
    const horizon = rollingHorizonLabel(now, 'HOUR');
    assert.equal(horizon, '2026-08-09-12');
    assert.ok(horizon < current);
  });

  test('rolling labels are UTC-based, independent of client timezone (BRD §4.2.5 is a pure sliding horizon)', () => {
    const now = new Date('2026-08-10T12:00:00Z');
    assert.equal(rollingBucketLabel(now, 'HOUR'), '2026-08-10-12');
  });
});

describe('buildRollingPipeline — STORY-03-06 pipeline shape', () => {
  test('produces 5 stages: prune, sum, guard, merge, bookkeeping', () => {
    const pipeline = buildRollingPipeline({
      oldestValidBucketLabel: '2026-08-09-12',
      currentBucketLabel: '2026-08-10-12',
      amountDelta: 100,
      countDelta: 1,
      thresholdAmount: 1000,
      thresholdCount: 10,
      clientId: 'CLIENT_A',
      now: new Date(),
      expireAt: new Date(),
    });
    assert.equal(pipeline.length, 5);
    assert.ok('$set' in pipeline[0] && 'buckets' in pipeline[0].$set, 'stage 1 must prune buckets');
    assert.ok('_sumA' in pipeline[1].$set && '_sumC' in pipeline[1].$set, 'stage 2 must compute both sums');
    assert.ok('_applied' in pipeline[2].$set, 'stage 3 must compute the applied guard');
  });

  test('an unconfigured threshold (Undefined = Unlimited, BRD §2.3) never blocks the guard', () => {
    const pipeline = buildRollingPipeline({
      oldestValidBucketLabel: '2026-08-09-12',
      currentBucketLabel: '2026-08-10-12',
      amountDelta: 100,
      countDelta: 1,
      thresholdAmount: undefined,
      thresholdCount: undefined,
      clientId: 'CLIENT_A',
      now: new Date(),
      expireAt: new Date(),
    });
    assert.equal(pipeline[2].$set._applied, true, 'with no threshold at all, the guard must be an unconditional pass, not a $and of nothing');
  });
});

describe('buildShardedRollingPipeline — STORY-03-06 AC6', () => {
  test('has no applied-guard stage — unconditional, soft semantics', () => {
    const pipeline = buildShardedRollingPipeline({
      oldestValidBucketLabel: '2026-08-09-12',
      currentBucketLabel: '2026-08-10-12',
      amountDelta: 100,
      countDelta: 1,
      clientId: 'CLIENT_A',
      now: new Date(),
      expireAt: new Date(),
    });
    assert.equal(pipeline.length, 3, 'prune, merge, bookkeeping only — no sum/guard stages');
    assert.equal(JSON.stringify(pipeline).includes('_applied'), false);
  });
});
