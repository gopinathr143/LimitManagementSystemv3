import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ClockSkewMonitor } from '../../src/services/clockSkew.service.js';

describe('ClockSkewMonitor — STORY-04-06 AC3', () => {
  test('within the ±1s tolerance is healthy', () => {
    const monitor = new ClockSkewMonitor({ toleranceMs: 1000 });
    const now = new Date('2026-08-10T12:00:00.000Z');
    const reference = new Date('2026-08-10T12:00:00.500Z');
    const result = monitor.check(reference, now);
    assert.equal(result.withinTolerance, true);
    assert.equal(monitor.isHealthy(), true);
  });

  test('skew beyond tolerance is unhealthy and would drain the instance', () => {
    const monitor = new ClockSkewMonitor({ toleranceMs: 1000 });
    const now = new Date('2026-08-10T12:00:00.000Z');
    const reference = new Date('2026-08-10T12:00:05.000Z'); // 5s skew
    const result = monitor.check(reference, now);
    assert.equal(result.withinTolerance, false);
    assert.equal(monitor.isHealthy(), false);
    assert.equal(result.skewMs, 5000);
  });

  test('recovers to healthy once skew is back in tolerance', () => {
    const monitor = new ClockSkewMonitor({ toleranceMs: 1000 });
    monitor.check(new Date('2026-08-10T12:00:05.000Z'), new Date('2026-08-10T12:00:00.000Z'));
    assert.equal(monitor.isHealthy(), false);
    monitor.check(new Date('2026-08-10T12:00:00.100Z'), new Date('2026-08-10T12:00:00.000Z'));
    assert.equal(monitor.isHealthy(), true);
  });
});
