import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearCollections, createApp, createTestClient } from './helpers/setup.js';

const VALID_DIMENSIONS = [
  { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: { DAILY_CALENDAR: { warming: true } } },
  { code: 'UCIC', attributes: ['ucic'], windows: { DAILY_CALENDAR: { warming: true } } },
];

async function registerClientWithWarmedRegistry(app) {
  const { clientId, apiKey } = await createTestClient(app);
  await request(app).put(`/clients/${clientId}/dimensions`).set('x-api-key', apiKey).send({ allowedDimensions: VALID_DIMENSIONS });
  return { clientId, apiKey };
}

describe('Limit definitions — STORY-02-04/02-05 (integration, real MongoDB replica set)', () => {
  let app;
  let db;
  let client;

  before(async () => {
    ({ client, db } = await connectTestDb('limit_definitions'));
    app = createApp(db);
  });

  beforeEach(async () => {
    await clearCollections(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC1: PER_TXN on the registered GLOBAL dimension is created and immediately effective', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    const res = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 10000000 });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.effective, true);
    assert.deepEqual(res.body.warnings, []);
  });

  test('STORY-02-05 AC1: a definition for an unregistered dimension is stored with a non-blocking warning', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    const res = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'NOT_REGISTERED', windowType: 'PER_TXN', thresholdAmount: 100 });

    assert.equal(res.status, 201, 'the write still succeeds');
    assert.equal(res.body.data.effective, false);
    assert.equal(res.body.warnings[0].code, 'DIMENSION_NOT_REGISTERED');
  });

  test('STORY-02-05 AC2: a definition for a window not declared on a registered dimension names the window gate specifically', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    const res = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'MONTHLY', thresholdAmount: 100 });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.effective, false);
    assert.equal(res.body.warnings[0].code, 'WINDOW_NOT_DECLARED');
    assert.match(res.body.warnings[0].message, /MONTHLY/);
  });

  test('STORY-02-05 AC4: a previously inert definition becomes effective once its gate opens, with no re-submission', async () => {
    const { clientId, apiKey } = await createTestClient(app);
    // No registry yet at all — the definition is inert for the strongest possible reason.
    const createRes = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 100 });
    assert.equal(createRes.body.data.effective, false);

    await request(app)
      .put(`/clients/${clientId}/dimensions`)
      .set('x-api-key', apiKey)
      .send({ allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });

    const getRes = await request(app).get(`/clients/${clientId}/limits/${createRes.body.data._id}`).set('x-api-key', apiKey);
    assert.equal(getRes.body.data.effective, true, 'PER_TXN only needs the dimension registered, which just happened');
  });

  test('STORY-02-05 AC3: list responses carry an effective flag per definition', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    await request(app).post(`/clients/${clientId}/limits`).set('x-api-key', apiKey).send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1 });
    await request(app).post(`/clients/${clientId}/limits`).set('x-api-key', apiKey).send({ dimensionCode: 'GLOBAL', windowType: 'MONTHLY', thresholdAmount: 1 });

    const listRes = await request(app).get(`/clients/${clientId}/limits`).set('x-api-key', apiKey);
    const effectiveFlags = listRes.body.data.map((d) => d.effective).sort();
    assert.deepEqual(effectiveFlags, [false, true]);
  });

  test('STORY-02-04 AC2: a scope override takes precedence over the wildcard default', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 100000 });
    await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'UCIC', windowType: 'DAILY_CALENDAR', thresholdAmount: 999999, scope: { ucic: 'U12345' } });

    const listRes = await request(app).get(`/clients/${clientId}/limits?dimensionCode=UCIC`).set('x-api-key', apiKey);
    assert.equal(listRes.body.data.length, 2);
    const scoped = listRes.body.data.find((d) => d.scope);
    const wildcard = listRes.body.data.find((d) => !d.scope);
    assert.equal(scoped.thresholdAmount, 999999);
    assert.equal(wildcard.thresholdAmount, 100000);
  });

  test('AC1/AC4: PUT updates a threshold, is visible immediately, and writes an audit entry with the new definitionVersion', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    const createRes = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 });

    const updateRes = await request(app)
      .put(`/clients/${clientId}/limits/${createRes.body.data._id}`)
      .set('x-api-key', apiKey)
      .send({ thresholdAmount: 5000 });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.thresholdAmount, 5000);
    assert.equal(updateRes.body.data.definitionVersion, 2);

    const auditEntries = await db.collection('limitsAudit').find({ clientId }).toArray();
    const updateAudit = auditEntries.find((e) => e.action === 'LIMIT_DEFINITION_UPDATED');
    assert.ok(updateAudit);
    assert.equal(updateAudit.definitionVersion, 2);
    assert.equal(updateAudit.before.thresholdAmount, 1000);
    assert.equal(updateAudit.after.thresholdAmount, 5000);
  });

  test('AC5: a definition with a future effectiveFrom is not applied yet', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000, effectiveFrom: future });

    assert.equal(res.body.data.effective, false);
    assert.equal(res.body.warnings[0].code, 'NOT_YET_EFFECTIVE_DATE');
  });

  test('DELETE soft-deactivates rather than removing the document', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    const createRes = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 });

    const deleteRes = await request(app).delete(`/clients/${clientId}/limits/${createRes.body.data._id}`).set('x-api-key', apiKey);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.data.isActive, false);
    assert.equal(deleteRes.body.data.effective, false);

    const stillReadable = await request(app).get(`/clients/${clientId}/limits/${createRes.body.data._id}`).set('x-api-key', apiKey);
    assert.equal(stillReadable.status, 200);
  });

  test('cross-tenant: client A cannot read, list, create, update or delete client B\'s limit definitions', async () => {
    const clientA = await registerClientWithWarmedRegistry(app);
    const clientB = await registerClientWithWarmedRegistry(app);
    const bDef = await request(app)
      .post(`/clients/${clientB.clientId}/limits`)
      .set('x-api-key', clientB.apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 });

    const crossList = await request(app).get(`/clients/${clientB.clientId}/limits`).set('x-api-key', clientA.apiKey);
    assert.equal(crossList.status, 403);

    const crossGet = await request(app).get(`/clients/${clientB.clientId}/limits/${bDef.body.data._id}`).set('x-api-key', clientA.apiKey);
    assert.equal(crossGet.status, 403);

    const crossCreate = await request(app)
      .post(`/clients/${clientB.clientId}/limits`)
      .set('x-api-key', clientA.apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1 });
    assert.equal(crossCreate.status, 403);
  });

  test('validation: rejects a float threshold and a definition with neither amount nor count', async () => {
    const { clientId, apiKey } = await registerClientWithWarmedRegistry(app);
    const floatRes = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 10.5 });
    assert.equal(floatRes.status, 400);

    const emptyRes = await request(app)
      .post(`/clients/${clientId}/limits`)
      .set('x-api-key', apiKey)
      .send({ dimensionCode: 'GLOBAL', windowType: 'DAILY_CALENDAR' });
    assert.equal(emptyRes.status, 400);
  });
});
