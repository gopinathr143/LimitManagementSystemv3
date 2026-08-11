import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ReplicationLagMonitor } from '../../src/services/replicationLag.service.js';
import { MetricsService } from '../../src/services/metrics.service.js';

function statusWith(members) {
  return { members };
}

describe('ReplicationLagMonitor — BRD §4.11 AC5', () => {
  test('a secondary within tolerance is healthy', () => {
    const monitor = new ReplicationLagMonitor({ toleranceMs: 5000 });
    const now = Date.now();
    const result = monitor.check(
      statusWith([
        { stateStr: 'PRIMARY', optimeDate: new Date(now) },
        { stateStr: 'SECONDARY', optimeDate: new Date(now - 1000) },
      ]),
    );
    assert.equal(result.withinTolerance, true);
    assert.equal(result.measured, true);
    assert.equal(result.lagMs, 1000);
    assert.equal(monitor.isHealthy(), true);
  });

  test('a secondary beyond tolerance is unhealthy and logs an alert', () => {
    const monitor = new ReplicationLagMonitor({ toleranceMs: 5000 });
    const now = Date.now();
    const result = monitor.check(
      statusWith([
        { stateStr: 'PRIMARY', optimeDate: new Date(now) },
        { stateStr: 'SECONDARY', optimeDate: new Date(now - 8000) },
      ]),
    );
    assert.equal(result.withinTolerance, false);
    assert.equal(result.lagMs, 8000);
    assert.equal(monitor.isHealthy(), false);
  });

  test('the furthest-behind secondary among several determines the reported lag', () => {
    const monitor = new ReplicationLagMonitor({ toleranceMs: 5000 });
    const now = Date.now();
    const result = monitor.check(
      statusWith([
        { stateStr: 'PRIMARY', optimeDate: new Date(now) },
        { stateStr: 'SECONDARY', optimeDate: new Date(now - 500) },
        { stateStr: 'SECONDARY', optimeDate: new Date(now - 9000) },
      ]),
    );
    assert.equal(result.lagMs, 9000);
    assert.equal(result.withinTolerance, false);
  });

  test('a single-node replica set (no secondaries) is trivially healthy and unmeasured — this codebase\'s local/dev topology', () => {
    const monitor = new ReplicationLagMonitor({ toleranceMs: 5000 });
    const result = monitor.check(statusWith([{ stateStr: 'PRIMARY', optimeDate: new Date() }]));
    assert.equal(result.withinTolerance, true);
    assert.equal(result.measured, false);
    assert.equal(result.lagMs, 0);
  });

  test('a missing/malformed status is treated the same as no secondaries — fails safe to "healthy, unmeasured" rather than throwing', () => {
    const monitor = new ReplicationLagMonitor({ toleranceMs: 5000 });
    const result = monitor.check(undefined);
    assert.equal(result.withinTolerance, true);
    assert.equal(result.measured, false);
  });

  test('when wired to a MetricsService, the gauge reflects the measured lag in seconds', async () => {
    const metricsService = new MetricsService({ collectDefaultMetrics: false });
    const monitor = new ReplicationLagMonitor({ toleranceMs: 5000, metricsService });
    const now = Date.now();
    monitor.check(
      statusWith([
        { stateStr: 'PRIMARY', optimeDate: new Date(now) },
        { stateStr: 'SECONDARY', optimeDate: new Date(now - 2000) },
      ]),
    );
    const exposition = await metricsService.exposition();
    assert.match(exposition, /imps_replication_lag_seconds 2\b/);
  });

  test('poll() calls db.admin().command({replSetGetStatus:1}) and applies the same policy', async () => {
    const now = Date.now();
    const fakeAdminDb = {
      command: async (cmd) => {
        assert.deepEqual(cmd, { replSetGetStatus: 1 });
        return statusWith([
          { stateStr: 'PRIMARY', optimeDate: new Date(now) },
          { stateStr: 'SECONDARY', optimeDate: new Date(now - 100) },
        ]);
      },
    };
    const monitor = new ReplicationLagMonitor({ toleranceMs: 5000 });
    const result = await monitor.poll(fakeAdminDb);
    assert.equal(result.withinTolerance, true);
    assert.equal(result.lagMs, 100);
  });
});
