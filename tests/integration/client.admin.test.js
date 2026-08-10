import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearCollections, createApp, adminHeaders } from './helpers/setup.js';

describe('Admin client CRUD — STORY-01-01 (integration, real MongoDB replica set)', () => {
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

  test('AC1: POST /clients persists ACTIVE client with unique id and audit fields', async () => {
    const res = await request(app)
      .post('/clients')
      .set(adminHeaders())
      .send({ clientId: 'CLIENT_IT_A', name: 'Client IT A', timezone: 'Asia/Kolkata' });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.client.status, 'ACTIVE');
    assert.equal(res.body.data.client.clientId, 'CLIENT_IT_A');
    assert.ok(res.body.data.apiKey);
    assert.equal(res.body.data.client.authBinding.apiKeyHash, undefined, 'hash must never leave the API');

    const stored = await db.collection('clients').findOne({ _id: 'CLIENT_IT_A' });
    assert.ok(stored.createdAt);
    assert.ok(stored.createdBy);
  });

  test('AC2: a duplicate clientId is rejected with 409 and no second record', async () => {
    await request(app).post('/clients').set(adminHeaders()).send({ clientId: 'CLIENT_IT_B', name: 'B', timezone: 'UTC' });

    const res = await request(app)
      .post('/clients')
      .set(adminHeaders())
      .send({ clientId: 'CLIENT_IT_B', name: 'B again', timezone: 'UTC' });

    assert.equal(res.status, 409);
    const count = await db.collection('clients').countDocuments({ _id: 'CLIENT_IT_B' });
    assert.equal(count, 1);
  });

  test('AC3: a non-admin caller is rejected on every /clients endpoint', async () => {
    const postRes = await request(app).post('/clients').send({ clientId: 'X', name: 'X', timezone: 'UTC' });
    assert.equal(postRes.status, 401);

    const getRes = await request(app).get('/clients');
    assert.equal(getRes.status, 401);

    const wrongKeyRes = await request(app).get('/clients').set('x-admin-api-key', 'not-a-real-admin-key');
    assert.equal(wrongKeyRes.status, 401);
  });

  test('AC4: an invalid IANA timezone is rejected and names the offending field', async () => {
    const res = await request(app)
      .post('/clients')
      .set(adminHeaders())
      .send({ clientId: 'CLIENT_IT_C', name: 'C', timezone: 'Mars/Olympus_Mons' });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.errors.some((e) => e.field === 'timezone'));

    const count = await db.collection('clients').countDocuments({ _id: 'CLIENT_IT_C' });
    assert.equal(count, 0);
  });

  test('AC5: PATCH status to SUSPENDED persists and writes an audit trail entry with actor and timestamp', async () => {
    await request(app).post('/clients').set(adminHeaders()).send({ clientId: 'CLIENT_IT_D', name: 'D', timezone: 'UTC' });

    const patchRes = await request(app).patch('/clients/CLIENT_IT_D').set(adminHeaders()).send({ status: 'SUSPENDED' });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.data.client.status, 'SUSPENDED');

    const auditEntries = await db.collection('configAudit').find({ clientId: 'CLIENT_IT_D' }).toArray();
    const statusChange = auditEntries.find((e) => e.action === 'CLIENT_STATUS_CHANGED');
    assert.ok(statusChange, 'expected a CLIENT_STATUS_CHANGED audit entry');
    assert.ok(statusChange.actor);
    assert.ok(statusChange.occurredAt);
    assert.equal(statusChange.before.status, 'ACTIVE');
    assert.equal(statusChange.after.status, 'SUSPENDED');
  });
});
