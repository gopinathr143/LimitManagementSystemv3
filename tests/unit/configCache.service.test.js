import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigCache } from '../../src/services/configCache.service.js';

function fakeRegistryDoc(clientId, configVersion = 1) {
  return {
    _id: clientId,
    clientId,
    configVersion,
    limitsVersion: 0,
    allowedDimensions: [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: { DAILY_CALENDAR: { declaredAt: new Date(), boundaryAt: new Date(), warming: false } } }],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildRepos({ registryDocs = new Map(), definitionsByClient = new Map(), failClientIds = new Set() } = {}) {
  const registryRepository = {
    async findByClientId(clientId) {
      if (failClientIds.has(clientId)) {
        throw new Error(`simulated Mongo outage for ${clientId}`);
      }
      return registryDocs.get(clientId) ?? null;
    },
  };
  const limitDefinitionRepository = {
    async listAllForCache(clientId) {
      if (failClientIds.has(clientId)) {
        throw new Error(`simulated Mongo outage for ${clientId}`);
      }
      return definitionsByClient.get(clientId) ?? [];
    },
  };
  return { registryRepository, limitDefinitionRepository, registryDocs, definitionsByClient, failClientIds };
}

describe('ConfigCache — STORY-02-06', () => {
  test('AC1: get() is a synchronous in-memory read, never touches the repositories', async () => {
    const { registryRepository, limitDefinitionRepository, registryDocs } = buildRepos({
      registryDocs: new Map([['CLIENT_A', fakeRegistryDoc('CLIENT_A')]]),
    });
    const cache = new ConfigCache(registryRepository, limitDefinitionRepository);
    await cache.refreshOne('CLIENT_A');

    const findByClientIdSpy = mock.method(registryRepository, 'findByClientId');
    const entry = cache.get('CLIENT_A');
    assert.equal(entry.registry.clientId, 'CLIENT_A');
    assert.equal(findByClientIdSpy.mock.calls.length, 0);
  });

  test('AC4: entries are keyed by clientId — refreshing one client never touches another', async () => {
    const { registryRepository, limitDefinitionRepository } = buildRepos({
      registryDocs: new Map([
        ['CLIENT_A', fakeRegistryDoc('CLIENT_A')],
        ['CLIENT_B', fakeRegistryDoc('CLIENT_B')],
      ]),
    });
    const cache = new ConfigCache(registryRepository, limitDefinitionRepository);
    await cache.refreshOne('CLIENT_A');
    await cache.refreshOne('CLIENT_B');

    const beforeB = cache.get('CLIENT_B');
    await cache.refreshOne('CLIENT_A');
    assert.strictEqual(cache.get('CLIENT_B'), beforeB, 'CLIENT_B entry object must be untouched by a CLIENT_A refresh');
  });

  test('AC3: a refresh failure keeps the last known good snapshot and does not throw', async () => {
    const { registryRepository, limitDefinitionRepository, failClientIds } = buildRepos({
      registryDocs: new Map([['CLIENT_A', fakeRegistryDoc('CLIENT_A', 1)]]),
    });
    const cache = new ConfigCache(registryRepository, limitDefinitionRepository);
    await cache.refreshOne('CLIENT_A');
    const goodEntry = cache.get('CLIENT_A');

    failClientIds.add('CLIENT_A');
    const result = await cache.refreshOne('CLIENT_A');

    assert.strictEqual(result, goodEntry);
    assert.strictEqual(cache.get('CLIENT_A'), goodEntry);
  });

  test('a client with no registry yet caches a null registry rather than throwing', async () => {
    const { registryRepository, limitDefinitionRepository } = buildRepos();
    const cache = new ConfigCache(registryRepository, limitDefinitionRepository);
    const entry = await cache.refreshOne('CLIENT_NEW');
    assert.equal(entry.registry, null);
    assert.deepEqual(entry.definitions, []);
  });

  test('STORY-02-01 AC4: concurrent readers never observe a partially-applied snapshot', async () => {
    const { registryRepository, limitDefinitionRepository, registryDocs } = buildRepos({
      registryDocs: new Map([['CLIENT_A', fakeRegistryDoc('CLIENT_A', 1)]]),
    });
    const cache = new ConfigCache(registryRepository, limitDefinitionRepository);
    await cache.refreshOne('CLIENT_A');

    registryDocs.set('CLIENT_A', fakeRegistryDoc('CLIENT_A', 2));
    const refreshPromise = cache.refreshOne('CLIENT_A');

    const observedVersions = new Set();
    for (let i = 0; i < 50; i += 1) {
      observedVersions.add(cache.get('CLIENT_A').registry.configVersion);
    }
    await refreshPromise;
    observedVersions.add(cache.get('CLIENT_A').registry.configVersion);

    for (const v of observedVersions) {
      assert.ok(v === 1 || v === 2, `observed an impossible intermediate version: ${v}`);
    }
  });

  test('warm() loads a set of clients in one call', async () => {
    const { registryRepository, limitDefinitionRepository } = buildRepos({
      registryDocs: new Map([
        ['CLIENT_A', fakeRegistryDoc('CLIENT_A')],
        ['CLIENT_B', fakeRegistryDoc('CLIENT_B')],
      ]),
    });
    const cache = new ConfigCache(registryRepository, limitDefinitionRepository);
    await cache.warm(['CLIENT_A', 'CLIENT_B']);
    assert.ok(cache.get('CLIENT_A'));
    assert.ok(cache.get('CLIENT_B'));
  });

  test('startPolling/stopPolling do not leave the process hanging and can be called safely twice', () => {
    const { registryRepository, limitDefinitionRepository } = buildRepos();
    const cache = new ConfigCache(registryRepository, limitDefinitionRepository, { refreshIntervalMs: 50 });
    cache.startPolling();
    cache.startPolling();
    cache.stopPolling();
    cache.stopPolling();
  });
});
