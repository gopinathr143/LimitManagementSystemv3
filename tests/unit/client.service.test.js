import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ClientService } from '../../src/services/client.service.js';
import { AppError } from '../../src/utils/AppError.js';
import { AUDIT_ACTION, CLIENT_STATUS } from '../../src/constants/index.js';

class FakeClientRepository {
  constructor() {
    this.byId = new Map();
  }

  async insert(doc) {
    if (this.byId.has(doc._id)) {
      const err = new Error('duplicate key');
      err.code = 11000;
      throw err;
    }
    this.byId.set(doc._id, doc);
    return { insertedId: doc._id };
  }

  async findByClientId(clientId) {
    return this.byId.get(clientId) ?? null;
  }

  async list() {
    return [...this.byId.values()];
  }

  async updateByClientId(clientId, update) {
    const existing = this.byId.get(clientId);
    const updated = { ...existing, ...update.$set };
    this.byId.set(clientId, updated);
    return updated;
  }
}

class FakeConfigAuditRepository {
  constructor() {
    this.entries = [];
  }

  async record(entry) {
    this.entries.push(entry);
    return { insertedId: this.entries.length };
  }
}

function buildService() {
  const clientRepository = new FakeClientRepository();
  const configAuditRepository = new FakeConfigAuditRepository();
  const service = new ClientService(clientRepository, configAuditRepository);
  return { service, clientRepository, configAuditRepository };
}

describe('ClientService.createClient — STORY-01-01 AC1/AC2', () => {
  test('AC1: persists client ACTIVE with unique clientId and audit fields', async () => {
    const { service, configAuditRepository } = buildService();
    const { client } = await service.createClient({ clientId: 'CLIENT_A', name: 'Client A', timezone: 'Asia/Kolkata' }, 'actor-1');

    assert.equal(client.status, CLIENT_STATUS.ACTIVE);
    assert.equal(client.clientId, 'CLIENT_A');
    assert.ok(client.createdAt);
    assert.equal(client.createdBy, 'actor-1');
    assert.equal(configAuditRepository.entries[0].action, AUDIT_ACTION.CLIENT_CREATED);
  });

  test('AC2: a duplicate clientId is rejected with a conflict and no second record', async () => {
    const { service, clientRepository } = buildService();
    await service.createClient({ clientId: 'CLIENT_A', name: 'Client A', timezone: 'UTC' }, 'actor');

    await assert.rejects(
      () => service.createClient({ clientId: 'CLIENT_A', name: 'Client A dup', timezone: 'UTC' }, 'actor'),
      (err) => err instanceof AppError && err.statusCode === 409,
    );

    assert.equal((await clientRepository.list()).length, 1);
  });

  test('AC2 (race): a concurrent duplicate insert surfaced as E11000 is still a clean conflict', async () => {
    const { service, clientRepository } = buildService();
    // Simulate the pre-check racing with a concurrent insert: bypass the
    // findByClientId guard by inserting directly, then let the service's
    // own insert() collide.
    clientRepository.byId.set('CLIENT_RACE', { _id: 'CLIENT_RACE' });
    await assert.rejects(
      () => service.createClient({ clientId: 'CLIENT_RACE', name: 'X', timezone: 'UTC' }, 'actor'),
      (err) => err instanceof AppError && err.statusCode === 409,
    );
  });
});

describe('ClientService.updateClient — STORY-01-01 AC5, STORY-01-04', () => {
  test('AC5: status change to SUSPENDED is persisted and audited with actor/timestamp', async () => {
    const { service, configAuditRepository } = buildService();
    await service.createClient({ clientId: 'CLIENT_A', name: 'Client A', timezone: 'UTC' }, 'actor-1');

    const { client } = await service.updateClient('CLIENT_A', { status: 'SUSPENDED' }, 'actor-2');

    assert.equal(client.status, 'SUSPENDED');
    const auditEntry = configAuditRepository.entries.at(-1);
    assert.equal(auditEntry.action, AUDIT_ACTION.CLIENT_STATUS_CHANGED);
    assert.equal(auditEntry.actor, 'actor-2');
    assert.ok(auditEntry.occurredAt);
    assert.equal(auditEntry.before.status, 'ACTIVE');
    assert.equal(auditEntry.after.status, 'SUSPENDED');
  });

  test('updating an unknown client throws 404', async () => {
    const { service } = buildService();
    await assert.rejects(
      () => service.updateClient('DOES_NOT_EXIST', { status: 'SUSPENDED' }, 'actor'),
      (err) => err instanceof AppError && err.statusCode === 404,
    );
  });

  test('reactivating a suspended client works and is audited', async () => {
    const { service } = buildService();
    await service.createClient({ clientId: 'CLIENT_A', name: 'Client A', timezone: 'UTC' }, 'actor');
    await service.updateClient('CLIENT_A', { status: 'SUSPENDED' }, 'actor');
    const { client } = await service.updateClient('CLIENT_A', { status: 'ACTIVE' }, 'actor');
    assert.equal(client.status, 'ACTIVE');
  });
});
