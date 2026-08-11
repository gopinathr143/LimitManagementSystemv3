import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RegistryService } from '../../src/services/registry.service.js';
import { AppError } from '../../src/utils/AppError.js';

class FakeRegistryRepository {
  constructor() {
    this.byClientId = new Map();
    this.replaceCalls = 0;
  }
  async findByClientId(clientId) {
    return this.byClientId.get(clientId) ?? null;
  }
  async replace(doc) {
    this.replaceCalls += 1;
    this.byClientId.set(doc._id, doc);
    return doc;
  }
}

class FakeLimitsAuditRepository {
  constructor() {
    this.entries = [];
  }
  async record(entry) {
    this.entries.push(entry);
  }
}

class FakeClientService {
  async getClient(clientId) {
    return { clientId, timezone: 'Asia/Kolkata' };
  }
}

class FakeConfigCache {
  constructor() {
    this.refreshedClientIds = [];
  }
  async refreshOne(clientId) {
    this.refreshedClientIds.push(clientId);
  }
}

const VALID_DIMENSIONS = [{ code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: ['DAILY_CALENDAR'] }];

function buildService() {
  const registryRepository = new FakeRegistryRepository();
  const limitsAuditRepository = new FakeLimitsAuditRepository();
  const clientService = new FakeClientService();
  const configCache = new FakeConfigCache();
  const service = new RegistryService(registryRepository, limitsAuditRepository, clientService, configCache);
  return { service, registryRepository, limitsAuditRepository, configCache };
}

describe('RegistryService.replaceRegistry — STORY-02-01', () => {
  test('creates version 1 on first save and writes a REGISTRY_CREATED audit entry', async () => {
    const { service, limitsAuditRepository } = buildService();
    const doc = await service.replaceRegistry('CLIENT_A', VALID_DIMENSIONS, 'admin-1');
    assert.equal(doc.configVersion, 1);
    assert.equal(limitsAuditRepository.entries[0].action, 'REGISTRY_CREATED');
    assert.equal(limitsAuditRepository.entries[0].before, null);
  });

  test('AC4: a subsequent valid replace increments configVersion and swaps atomically (single set call)', async () => {
    const { service, registryRepository } = buildService();
    await service.replaceRegistry('CLIENT_A', VALID_DIMENSIONS, 'admin-1');
    const doc2 = await service.replaceRegistry('CLIENT_A', VALID_DIMENSIONS, 'admin-1');
    assert.equal(doc2.configVersion, 2);
    assert.equal(registryRepository.replaceCalls, 2);
  });

  test('AC2: an invalid registry is rejected and the previously loaded snapshot stays in force', async () => {
    const { service, registryRepository } = buildService();
    await service.replaceRegistry('CLIENT_A', VALID_DIMENSIONS, 'admin-1');

    await assert.rejects(
      () => service.replaceRegistry('CLIENT_A', [{ code: 'UCIC', attributes: ['ucic'], windows: ['DAILY_CALENDAR'] }], 'admin-1'),
      AppError,
    );

    const stillLoaded = await registryRepository.findByClientId('CLIENT_A');
    assert.equal(stillLoaded.configVersion, 1);
    assert.equal(registryRepository.replaceCalls, 1, 'replace must not have been called for the rejected submission');
  });

  test('AC5: client A registry change does not affect client B', async () => {
    const { service, registryRepository } = buildService();
    await service.replaceRegistry('CLIENT_A', VALID_DIMENSIONS, 'admin-1');
    await service.replaceRegistry('CLIENT_B', VALID_DIMENSIONS, 'admin-1');
    await service.replaceRegistry('CLIENT_A', VALID_DIMENSIONS, 'admin-1');

    const b = await registryRepository.findByClientId('CLIENT_B');
    assert.equal(b.configVersion, 1);
  });

  test('pushes a cache refresh for the affected client after a successful write', async () => {
    const { service, configCache } = buildService();
    await service.replaceRegistry('CLIENT_A', VALID_DIMENSIONS, 'admin-1');
    assert.deepEqual(configCache.refreshedClientIds, ['CLIENT_A']);
  });
});
