import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { ReplicationLagMonitor } from '../../src/services/replicationLag.service.js';

describe('ReplicationLagMonitor — real replica set (integration)', () => {
  let client;
  let db;

  before(async () => {
    ({ client, db } = await connectTestDb('replication_lag'));
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('poll() runs cleanly against the real single-node replica set and reports healthy/unmeasured', async () => {
    const monitor = new ReplicationLagMonitor();
    const result = await monitor.poll(db.admin());

    assert.equal(result.withinTolerance, true);
    assert.equal(monitor.isHealthy(), true);
    // This environment's replica set is single-node (no secondary), matching the "unmeasured, trivially healthy"
    // branch proven with fake multi-member data in the unit tests — this test's job is only to prove the real
    // `replSetGetStatus` driver call and response shape are compatible with `check()`, not to exercise the
    // multi-secondary lag-detection policy itself (that needs a topology this local environment doesn't have).
    assert.equal(result.measured, false);
  });

  test('start()/stop() run a real poll on an interval without throwing', async () => {
    const monitor = new ReplicationLagMonitor();
    monitor.start(db.admin(), 50);
    await new Promise((resolve) => setTimeout(resolve, 120));
    monitor.stop();
    assert.equal(monitor.isHealthy(), true);
  });
});
