import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LimitDefinitionService } from '../../src/services/limitDefinition.service.js';

let nextId = 1;

class FakeLimitDefinitionRepository {
  constructor() {
    this.docs = new Map();
  }
  async insert(clientId, doc) {
    const _id = `id-${nextId++}`;
    const stored = { _id, ...doc, clientId };
    this.docs.set(_id, stored);
    return stored;
  }
  async findById(clientId, id) {
    const doc = this.docs.get(id);
    return doc && doc.clientId === clientId ? doc : null;
  }
  async listAll(clientId) {
    return [...this.docs.values()].filter((d) => d.clientId === clientId);
  }
  async updateById(clientId, id, update) {
    const existing = await this.findById(clientId, id);
    if (!existing) return null;
    const updated = { ...existing, ...(update.$set ?? {}) };
    if (update.$inc?.definitionVersion) {
      updated.definitionVersion = existing.definitionVersion + update.$inc.definitionVersion;
    }
    this.docs.set(id, updated);
    return updated;
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

class FakeRegistryRepository {
  async bumpLimitsVersion() {}
}

class FakeRegistryService {
  constructor(snapshot) {
    this.snapshot = snapshot;
  }
  async getRegistry() {
    if (!this.snapshot) {
      const err = new Error('not found');
      err.statusCode = 404;
      throw err;
    }
    return this.snapshot;
  }
}

function buildService(registrySnapshot) {
  const limitDefinitionRepository = new FakeLimitDefinitionRepository();
  const limitsAuditRepository = new FakeLimitsAuditRepository();
  const registryRepository = new FakeRegistryRepository();
  const registryService = new FakeRegistryService(registrySnapshot);
  const service = new LimitDefinitionService(limitDefinitionRepository, limitsAuditRepository, registryRepository, registryService, null);
  return { service, limitDefinitionRepository, limitsAuditRepository };
}

const REGISTERED_SNAPSHOT = {
  allowedDimensions: [{ code: 'GLOBAL', windows: {} }],
};

describe('LimitDefinitionService.createDefinition — STORY-02-04', () => {
  test('creates a definition at version 1 and records a LIMIT_DEFINITION_CREATED audit entry', async () => {
    const { service, limitsAuditRepository } = buildService(REGISTERED_SNAPSHOT);
    const result = await service.createDefinition('CLIENT_A', { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 }, 'actor-1');
    assert.equal(result.definitionVersion, 1);
    assert.equal(limitsAuditRepository.entries[0].action, 'LIMIT_DEFINITION_CREATED');
    assert.equal(limitsAuditRepository.entries[0].definitionVersion, 1);
  });

  test('STORY-02-05 AC1: a definition for an unregistered dimension is stored but reported not effective, with a warning reason', async () => {
    const { service } = buildService(REGISTERED_SNAPSHOT);
    const result = await service.createDefinition('CLIENT_A', { dimensionCode: 'NOT_REGISTERED', windowType: 'PER_TXN', thresholdAmount: 1000 }, 'actor-1');
    assert.equal(result.effective, false);
    assert.equal(result.effectivenessReason, 'DIMENSION_NOT_REGISTERED');
  });
});

describe('LimitDefinitionService.updateDefinition — STORY-02-04 AC1, AC4', () => {
  test('AC1: an update is visible on the very next read, with an incremented definitionVersion', async () => {
    const { service } = buildService(REGISTERED_SNAPSHOT);
    const created = await service.createDefinition('CLIENT_A', { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 }, 'actor-1');
    const updated = await service.updateDefinition('CLIENT_A', created._id, { thresholdAmount: 2000 }, 'actor-2');
    assert.equal(updated.thresholdAmount, 2000);
    assert.equal(updated.definitionVersion, 2);

    const fetched = await service.getDefinition('CLIENT_A', created._id);
    assert.equal(fetched.thresholdAmount, 2000);
  });

  test('AC4: every update writes an immutable audit entry with actor, before, after and the new definitionVersion', async () => {
    const { service, limitsAuditRepository } = buildService(REGISTERED_SNAPSHOT);
    const created = await service.createDefinition('CLIENT_A', { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 }, 'actor-1');
    await service.updateDefinition('CLIENT_A', created._id, { thresholdAmount: 500 }, 'actor-2');

    const auditEntry = limitsAuditRepository.entries.at(-1);
    assert.equal(auditEntry.action, 'LIMIT_DEFINITION_UPDATED');
    assert.equal(auditEntry.actor, 'actor-2');
    assert.equal(auditEntry.before.thresholdAmount, 1000);
    assert.equal(auditEntry.after.thresholdAmount, 500);
    assert.equal(auditEntry.definitionVersion, 2);
  });

  test('updating a non-existent definition throws 404', async () => {
    const { service } = buildService(REGISTERED_SNAPSHOT);
    await assert.rejects(
      () => service.updateDefinition('CLIENT_A', 'does-not-exist', { thresholdAmount: 1 }, 'actor'),
      (err) => err.statusCode === 404,
    );
  });
});

describe('LimitDefinitionService.deactivateDefinition', () => {
  test('soft-deactivates (isActive:false) and preserves definitionVersion history rather than deleting', async () => {
    const { service, limitDefinitionRepository } = buildService(REGISTERED_SNAPSHOT);
    const created = await service.createDefinition('CLIENT_A', { dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 }, 'actor-1');
    await service.deactivateDefinition('CLIENT_A', created._id, 'actor-2');

    const stillThere = await limitDefinitionRepository.findById('CLIENT_A', created._id);
    assert.equal(stillThere.isActive, false);
    assert.equal(stillThere.definitionVersion, 2);
  });
});
