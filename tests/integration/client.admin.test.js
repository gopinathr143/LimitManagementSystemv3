import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearCollections, createApp } from './helpers/setup.js';

describe('Client CRUD — STORY-01-01 (integration, real MongoDB replica set)', () => {
  let app;
  let db;
  let client;

  before(async () => {
    ({ client, db } = await connectTestDb('client_admin'));
    app = createApp(db);
  });

  beforeEach(async () => {
    await clearCollections(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1: POST /clients persists ACTIVE client with unique id and audit fields, no credential required', async () => {
    const res = await request(app).post('/clients').send({ clientId: 'CLIENT_IT_A', name: 'Client IT A', timezone: 'Asia/Kolkata' });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.client.status, 'ACTIVE');
    assert.equal(res.body.data.client.clientId, 'CLIENT_IT_A');
    assert.equal(res.body.data.client.authBinding, undefined, 'no auth binding is stored');

    const stored = await db.collection('clients').findOne({ _id: 'CLIENT_IT_A' });
    assert.ok(stored.createdAt);
    assert.ok(stored.createdBy);
    assert.equal(stored.authBinding, undefined);
  });

  test('AC2: a duplicate clientId is rejected with 409 and no second record', async () => {
    await request(app).post('/clients').send({ clientId: 'CLIENT_IT_B', name: 'B', timezone: 'UTC' });

    const res = await request(app).post('/clients').send({ clientId: 'CLIENT_IT_B', name: 'B again', timezone: 'UTC' });

    assert.equal(res.status, 409);
    const count = await db.collection('clients').countDocuments({ _id: 'CLIENT_IT_B' });
    assert.equal(count, 1);
  });

  test('AC4: an invalid IANA timezone is rejected and names the offending field', async () => {
    const res = await request(app).post('/clients').send({ clientId: 'CLIENT_IT_C', name: 'C', timezone: 'Mars/Olympus_Mons' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.errors.some((e) => e.field === 'timezone'));

    const count = await db.collection('clients').countDocuments({ _id: 'CLIENT_IT_C' });
    assert.equal(count, 0);
  });

  test('AC5: PATCH status to SUSPENDED persists and writes an audit trail entry with actor and timestamp', async () => {
    await request(app).post('/clients').send({ clientId: 'CLIENT_IT_D', name: 'D', timezone: 'UTC' });

    const patchRes = await request(app)
      .patch('/clients/CLIENT_IT_D')
      .set('x-actor-id', 'ops-console-1')
      .send({ status: 'SUSPENDED' });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.client.status, 'SUSPENDED');

    const auditEntries = await db.collection('configAudit').find({ clientId: 'CLIENT_IT_D' }).toArray();
    const statusChange = auditEntries.find((e) => e.action === 'CLIENT_STATUS_CHANGED');
    assert.ok(statusChange, 'expected a CLIENT_STATUS_CHANGED audit entry');
    assert.equal(statusChange.actor, 'ops-console-1');
    assert.ok(statusChange.occurredAt);
    assert.equal(statusChange.before.status, 'ACTIVE');
    assert.equal(statusChange.after.status, 'SUSPENDED');
  });

  test('no x-actor-id header falls back to "unknown" rather than failing', async () => {
    await request(app).post('/clients').send({ clientId: 'CLIENT_IT_E', name: 'E', timezone: 'UTC' });
    const stored = await db.collection('clients').findOne({ _id: 'CLIENT_IT_E' });
    assert.equal(stored.createdBy, 'unknown');
  });
});
