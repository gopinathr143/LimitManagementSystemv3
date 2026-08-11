import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ReadPreference } from 'mongodb';
import { CounterRepository } from '../../src/repositories/counter.repository.js';

/**
 * STORY-03-07 AC2 — "read preference is primary and this is asserted by an
 * automated check rather than convention." A fake `collection` records the
 * exact options every repository call passes through, so drift away from
 * PRIMARY_READ_OPTS/HOT_PATH_WRITE_OPTS is a failing test, not a code-review hope.
 */
function fakeCollection() {
  const calls = [];
  return {
    calls,
    findOne: async (filter, options) => {
      calls.push({ op: 'findOne', options });
      return null;
    },
    find: (filter, options) => {
      calls.push({ op: 'find', options });
      return { toArray: async () => [] };
    },
    updateOne: async (filter, update, options) => {
      calls.push({ op: 'updateOne', options });
      return { matchedCount: 1 };
    },
    findOneAndUpdate: async (filter, update, options) => {
      calls.push({ op: 'findOneAndUpdate', options });
      return {};
    },
    insertOne: async () => ({ insertedId: 'x' }),
  };
}

describe('CounterRepository — STORY-03-07 read preference / write concern policy', () => {
  test('AC2: every read explicitly requests primary read preference', async () => {
    const collection = fakeCollection();
    const repo = new CounterRepository(collection);

    await repo.findByKey('CLIENT_A', 'key-1');
    await repo.sumKeys('CLIENT_A', ['key-1', 'key-2']);
    await repo.sumRollingKeys('CLIENT_A', ['key-1'], '2026-08-09-12');

    const reads = collection.calls.filter((c) => c.op === 'findOne' || c.op === 'find');
    assert.ok(reads.length >= 3, 'expected at least one call per read method');
    for (const call of reads) {
      assert.equal(call.options.readPreference, ReadPreference.PRIMARY, `${call.op} must explicitly request primary read preference`);
    }
  });

  test('AC3: every counter mutation uses the hot-path write concern (w:1), never left to a driver default', async () => {
    const collection = fakeCollection();
    const repo = new CounterRepository(collection);

    await repo.bootstrap('CLIENT_A', 'key-1', { clientId: 'CLIENT_A', amount: 0, count: 0 });
    await repo.guardedIncrement('CLIENT_A', 'key-1', { guardFilter: {}, amountDelta: 1, countDelta: 1, now: new Date() });
    await repo.guardedDecrement('CLIENT_A', 'key-1', { amountDelta: 1, countDelta: 1, now: new Date() });
    await repo.incrementShardUnconditional('CLIENT_A', 'key-1#0', { amountDelta: 1, countDelta: 1, now: new Date(), expireAt: new Date() });
    await repo.rollingPipelineUpdate('CLIENT_A', 'key-1', []);
    await repo.decrementRollingBucket('CLIENT_A', 'key-1', { bucketLabel: '2026-08-09-12', amountDelta: 1, countDelta: 1, now: new Date() });

    const writes = collection.calls.filter((c) => c.op === 'updateOne' || c.op === 'findOneAndUpdate');
    assert.equal(writes.length, 6);
    for (const call of writes) {
      assert.deepEqual(call.options.writeConcern, { w: 1 }, `${call.op} must use the hot-path write concern`);
    }
  });

  test('guardedIncrement and guardedDecrement structurally cannot be called with upsert enabled (STORY-03-03 DoD)', async () => {
    const collection = fakeCollection();
    const repo = new CounterRepository(collection);

    await repo.guardedIncrement('CLIENT_A', 'key-1', { guardFilter: {}, amountDelta: 1, countDelta: 1, now: new Date() });
    await repo.guardedDecrement('CLIENT_A', 'key-1', { amountDelta: 1, countDelta: 1, now: new Date() });

    // Neither method's signature accepts an options/upsert override at all — asserting the two
    // recorded calls both carry upsert:false is what "structurally impossible" looks like at runtime.
    const guardedCalls = collection.calls.filter((c) => c.op === 'updateOne');
    for (const call of guardedCalls) {
      assert.equal(call.options.upsert, false);
    }
    assert.equal(repo.guardedIncrement.length <= 3, true, 'guardedIncrement must not accept a caller-supplied options bag');
    assert.equal(repo.guardedDecrement.length <= 3, true, 'guardedDecrement must not accept a caller-supplied options bag');
  });
});
