import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TenantScopedRepository } from '../../src/repositories/base.repository.js';

function fakeCollection(recorder) {
  return {
    findOne: async (filter) => {
      recorder.push({ op: 'findOne', filter });
      return { _id: 'doc-1', ...filter };
    },
    find: (filter) => {
      recorder.push({ op: 'find', filter });
      return { toArray: async () => [{ _id: 'doc-1', ...filter }] };
    },
    insertOne: async (doc) => {
      recorder.push({ op: 'insertOne', doc });
      return { insertedId: 'doc-1' };
    },
    updateOne: async (filter, update) => {
      recorder.push({ op: 'updateOne', filter, update });
      return { matchedCount: 1 };
    },
    deleteOne: async (filter) => {
      recorder.push({ op: 'deleteOne', filter });
      return { deletedCount: 1 };
    },
    countDocuments: async (filter) => {
      recorder.push({ op: 'countDocuments', filter });
      return 1;
    },
  };
}

describe('TenantScopedRepository — STORY-01-03 structural isolation guard', () => {
  test('findOne without clientId throws instead of returning cross-tenant data', async () => {
    const recorder = [];
    const repo = new TenantScopedRepository(fakeCollection(recorder));
    await assert.rejects(() => repo.findOne(undefined, { code: 'GLOBAL' }), TypeError);
    await assert.rejects(() => repo.findOne('', { code: 'GLOBAL' }), TypeError);
    assert.equal(recorder.length, 0, 'no query should reach the collection when clientId is missing');
  });

  test('findOne injects clientId into the query predicate', async () => {
    const recorder = [];
    const repo = new TenantScopedRepository(fakeCollection(recorder));
    await repo.findOne('CLIENT_A', { code: 'GLOBAL' });
    assert.deepEqual(recorder[0].filter, { code: 'GLOBAL', clientId: 'CLIENT_A' });
  });

  test('a filter naming a different clientId is rejected rather than silently overridden', async () => {
    const recorder = [];
    const repo = new TenantScopedRepository(fakeCollection(recorder));
    await assert.rejects(() => repo.findOne('CLIENT_A', { clientId: 'CLIENT_B' }), TypeError);
  });

  test('insertOne stamps clientId on the document and rejects a mismatching one', async () => {
    const recorder = [];
    const repo = new TenantScopedRepository(fakeCollection(recorder));
    await repo.insertOne('CLIENT_A', { amount: 100 });
    assert.equal(recorder[0].doc.clientId, 'CLIENT_A');

    await assert.rejects(() => repo.insertOne('CLIENT_A', { clientId: 'CLIENT_B', amount: 100 }), TypeError);
  });

  test('updateOne, deleteOne and countDocuments all scope by clientId', async () => {
    const recorder = [];
    const repo = new TenantScopedRepository(fakeCollection(recorder));
    await repo.updateOne('CLIENT_A', { _id: 'x' }, { $inc: { amount: 1 } });
    await repo.deleteOne('CLIENT_A', { _id: 'x' });
    await repo.countDocuments('CLIENT_A', {});
    for (const entry of recorder) {
      assert.equal(entry.filter.clientId, 'CLIENT_A');
    }
  });
});
