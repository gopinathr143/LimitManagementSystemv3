import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearCollections, createApp, createTestClient } from './helpers/setup.js';

const VALID_DIMENSIONS = [
  { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: ['DAILY_CALENDAR', 'MONTHLY'] },
  { code: 'UCIC', attributes: ['ucic'], windows: ['DAILY_CALENDAR'] },
];

describe('Dimension registry — STORY-02-01/02/03 (integration, real MongoDB replica set)', () => {
  let app;
  let db;
  let client;

  before(async () => {
    ({ client, db } = await connectTestDb('registry'));
    app = createApp(db);
  });

  beforeEach(async () => {
    await clearCollections(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('STORY-01-04: an unknown clientId is rejected before any registry access', async () => {
    const res = await request(app).get('/clients/NO_SUCH_CLIENT/dimensions');
    assert.equal(res.status, 404);
  });

  test('STORY-01-04: a SUSPENDED client is rejected', async () => {
    const { clientId } = await createTestClient(app);
    await request(app).patch(`/clients/${clientId}`).send({ status: 'SUSPENDED' });
    const res = await request(app).get(`/clients/${clientId}/dimensions`);
    assert.equal(res.status, 403);
  });

  test('AC2: PUT rejects a registry missing GLOBAL and names the reason', async () => {
    const { clientId } = await createTestClient(app);
    const res = await request(app)
      .put(`/clients/${clientId}/dimensions`)
      .send({ allowedDimensions: [{ code: 'UCIC', attributes: ['ucic'], windows: ['DAILY_CALENDAR'] }] });

    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.errors.some((e) => /GLOBAL/.test(e.message)));

    const getRes = await request(app).get(`/clients/${clientId}/dimensions`);
    assert.equal(getRes.status, 404, 'no snapshot should have been persisted at all');
  });

  test('AC3: PUT rejects an unknown attribute and names the dimension', async () => {
    const { clientId } = await createTestClient(app);
    const res = await request(app)
      .put(`/clients/${clientId}/dimensions`)
      .send({
        allowedDimensions: [
          { code: 'GLOBAL', attributes: [], hot: true, shardFactor: 32, windows: ['DAILY_CALENDAR'] },
          { code: 'BAD', attributes: ['notReal'], windows: ['DAILY_CALENDAR'] },
        ],
      });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.errors.some((e) => e.dimensionCode === 'BAD'));
  });

  test('AC4: a valid PUT persists and GET reflects it with derived window state', async () => {
    const { clientId } = await createTestClient(app);
    const putRes = await request(app).put(`/clients/${clientId}/dimensions`).send({ allowedDimensions: VALID_DIMENSIONS });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.data.configVersion, 1);

    const getRes = await request(app).get(`/clients/${clientId}/dimensions`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.allowedDimensions[0].windows.DAILY_CALENDAR.state, 'PENDING_ACTIVATION');
  });

  test('AC2 (again, on second version): an invalid update after a valid one leaves the valid snapshot in force', async () => {
    const { clientId } = await createTestClient(app);
    await request(app).put(`/clients/${clientId}/dimensions`).send({ allowedDimensions: VALID_DIMENSIONS });

    const badRes = await request(app)
      .put(`/clients/${clientId}/dimensions`)
      .send({ allowedDimensions: [{ code: 'UCIC', attributes: ['ucic'], windows: ['DAILY_CALENDAR'] }] });
    assert.equal(badRes.status, 400);

    const getRes = await request(app).get(`/clients/${clientId}/dimensions`);
    assert.equal(getRes.body.data.configVersion, 1);
  });

  test('AC1/AC5: two clients enforce only their own registry, independently', async () => {
    const clientA = await createTestClient(app);
    const clientB = await createTestClient(app);

    await request(app).put(`/clients/${clientA.clientId}/dimensions`).send({ allowedDimensions: VALID_DIMENSIONS });
    await request(app)
      .put(`/clients/${clientB.clientId}/dimensions`)
      .send({ allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['MONTHLY'] }] });

    const aView = await request(app).get(`/clients/${clientA.clientId}/dimensions`);
    const bView = await request(app).get(`/clients/${clientB.clientId}/dimensions`);

    assert.equal(aView.body.data.allowedDimensions.length, 2);
    assert.equal(bView.body.data.allowedDimensions.length, 1);

    // Changing A does not affect B.
    await request(app).put(`/clients/${clientA.clientId}/dimensions`).send({ allowedDimensions: VALID_DIMENSIONS });
    const bViewAgain = await request(app).get(`/clients/${clientB.clientId}/dimensions`);
    assert.equal(bViewAgain.body.data.configVersion, 1);
  });
});
