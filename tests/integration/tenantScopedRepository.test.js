import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { TenantScopedRepository } from '../../src/repositories/base.repository.js';

/**
 * Proves the structural isolation guard (STORY-01-03 AC1/AC3) against a
 * real MongoDB replica set, using a throwaway collection shaped like a
 * future tenant-owned collection (limits/counters land in later epics, but
 * they will all extend TenantScopedRepository the same way this does).
 *
 * Documents are keyed by a `key` field, not `_id` — real counter documents
 * prefix `_id` with clientId (BRD §4.2: `limit:{clientId}:...`) precisely so
 * two clients can never collide on the same primary key. Using a plain
 * shared `key` field here (with Mongo auto-generating `_id`) isolates what
 * this test is actually proving: the repository-level clientId scoping,
 * independent of key-naming discipline.
 */
describe('TenantScopedRepository — real MongoDB isolation (STORY-01-03)', () => {
  let repo;
  let db;
  let client;

  before(async () => {
    ({ client, db } = await connectTestDb('tenant_scoped_repo'));
    await db.collection('testTenantIsolationData').deleteMany({});
    repo = new TenantScopedRepository(db.collection('testTenantIsolationData'));
  });

  after(async () => {
    await db.collection('testTenantIsolationData').deleteMany({});
    await disconnectTestDb(client);
  });

  test('AC3: a query without clientId fails fast rather than returning cross-tenant data', async () => {
    await repo.insertOne('CLIENT_ISO_A', { key: 'shared-key', dimensionCode: 'GLOBAL', amount: 100 });
    await repo.insertOne('CLIENT_ISO_B', { key: 'shared-key', dimensionCode: 'GLOBAL', amount: 999 });

    await assert.rejects(() => repo.find(undefined, { dimensionCode: 'GLOBAL' }), TypeError);
  });

  test('AC1: two clients with identical keys stay fully independent under concurrent writes', async () => {
    const incrementsA = Array.from({ length: 25 }, () =>
      repo.updateOne('CLIENT_ISO_A', { key: 'shared-key' }, { $inc: { amount: 10, count: 1 } }),
    );
    const incrementsB = Array.from({ length: 10 }, () =>
      repo.updateOne('CLIENT_ISO_B', { key: 'shared-key' }, { $inc: { amount: 10, count: 1 } }),
    );

    await Promise.all([...incrementsA, ...incrementsB]);

    const docA = await repo.findOne('CLIENT_ISO_A', { key: 'shared-key' });
    const docB = await repo.findOne('CLIENT_ISO_B', { key: 'shared-key' });

    assert.equal(docA.count, 25);
    assert.equal(docA.amount, 350);
    assert.equal(docB.count, 10);
    assert.equal(docB.amount, 1099);
  });

  test('AC4-precursor: decrementing (reversal-style) client A never touches client B', async () => {
    await repo.updateOne('CLIENT_ISO_A', { key: 'shared-key' }, { $inc: { amount: -50, count: -1 } });

    const docA = await repo.findOne('CLIENT_ISO_A', { key: 'shared-key' });
    const docB = await repo.findOne('CLIENT_ISO_B', { key: 'shared-key' });

    assert.equal(docA.amount, 300);
    assert.equal(docB.amount, 1099, 'client B must be untouched by client A\'s decrement');
  });
});
