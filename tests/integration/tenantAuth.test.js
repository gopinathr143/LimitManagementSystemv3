import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearCollections } from './helpers/setup.js';
import { buildTenantTestApp } from './helpers/tenantTestApp.js';

describe('Tenant auth & fail-closed gating — STORY-01-02, STORY-01-04 (integration, real MongoDB)', () => {
  let app;
  let clientService;
  let db;
  let client;

  before(async () => {
    ({ client, db } = await connectTestDb('tenant_auth'));
    ({ app, clientService } = buildTenantTestApp(db));
  });

  beforeEach(async () => {
    await clearCollections(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('STORY-01-02 AC1: a valid principal resolves clientId and proceeds', async () => {
    const { apiKey } = await clientService.createClient({ clientId: 'CLIENT_T1', name: 'T1', timezone: 'UTC' }, 'admin');
    const res = await request(app).post('/probe').set('x-api-key', apiKey);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.clientId, 'CLIENT_T1');
  });

  test('STORY-01-02 AC2: payload clientId mismatching the principal is rejected before any access', async () => {
    const { apiKey } = await clientService.createClient({ clientId: 'CLIENT_T2', name: 'T2', timezone: 'UTC' }, 'admin');
    const res = await request(app).post('/probe').set('x-api-key', apiKey).send({ clientId: 'CLIENT_OTHER' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CLIENT_ID_MISMATCH');
  });

  test('STORY-01-02 AC3: no credential -> unauthenticated, no clientId resolved', async () => {
    const res = await request(app).post('/probe');
    assert.equal(res.status, 401);
  });

  test('STORY-01-02 AC3: unrecognised credential -> unauthenticated', async () => {
    const res = await request(app).post('/probe').set('x-api-key', 'never-issued-key');
    assert.equal(res.status, 401);
  });

  test('STORY-01-02 AC4: a rotated credential is rejected (old key no longer resolves)', async () => {
    const { apiKey: oldKey } = await clientService.createClient({ clientId: 'CLIENT_T3', name: 'T3', timezone: 'UTC' }, 'admin');
    await clientService.updateClient('CLIENT_T3', { rotateAuth: true }, 'admin');

    const res = await request(app).post('/probe').set('x-api-key', oldKey);
    assert.equal(res.status, 401);
  });

  test('STORY-01-04 AC1: an unregistered credential is rejected before any counter access', async () => {
    const res = await request(app).post('/probe').set('x-api-key', 'totally-unregistered');
    assert.equal(res.status, 401);
  });

  test('STORY-01-04 AC2: a SUSPENDED client is rejected and no counter is touched', async () => {
    const { apiKey } = await clientService.createClient({ clientId: 'CLIENT_T4', name: 'T4', timezone: 'UTC' }, 'admin');
    await clientService.updateClient('CLIENT_T4', { status: 'SUSPENDED' }, 'admin');

    const res = await request(app).post('/probe').set('x-api-key', apiKey);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CLIENT_NOT_ACTIVE');
  });

  test('STORY-01-04 AC3: status change mid-flight is picked up on the very next request, no restart needed', async () => {
    const { apiKey } = await clientService.createClient({ clientId: 'CLIENT_T5', name: 'T5', timezone: 'UTC' }, 'admin');

    const before1 = await request(app).post('/probe').set('x-api-key', apiKey);
    assert.equal(before1.status, 200);

    await clientService.updateClient('CLIENT_T5', { status: 'SUSPENDED' }, 'admin');

    const after1 = await request(app).post('/probe').set('x-api-key', apiKey);
    assert.equal(after1.status, 403);
  });

  test('STORY-01-04 AC4: a reactivated client is processed normally again', async () => {
    const { apiKey } = await clientService.createClient({ clientId: 'CLIENT_T6', name: 'T6', timezone: 'UTC' }, 'admin');
    await clientService.updateClient('CLIENT_T6', { status: 'SUSPENDED' }, 'admin');
    await clientService.updateClient('CLIENT_T6', { status: 'ACTIVE' }, 'admin');

    const res = await request(app).post('/probe').set('x-api-key', apiKey);
    assert.equal(res.status, 200);
  });

  test('STORY-01-03 AC2: requesting another client\'s resource path is rejected with no data returned', async () => {
    const { apiKey: keyA } = await clientService.createClient({ clientId: 'CLIENT_T7A', name: 'A', timezone: 'UTC' }, 'admin');
    await clientService.createClient({ clientId: 'CLIENT_T7B', name: 'B', timezone: 'UTC' }, 'admin');

    const res = await request(app).get('/clients/CLIENT_T7B/probe').set('x-api-key', keyA);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CROSS_TENANT_ACCESS_DENIED');
    assert.equal(res.body.data, undefined);

    const ownRes = await request(app).get('/clients/CLIENT_T7A/probe').set('x-api-key', keyA);
    assert.equal(ownRes.status, 200);
  });
});
