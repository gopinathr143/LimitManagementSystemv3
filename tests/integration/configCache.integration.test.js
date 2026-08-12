import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearCollections, createApp, createTestClient } from './helpers/setup.js';

describe('Config cache wiring — STORY-02-06 (integration, real MongoDB replica set)', () => {
  let app;
  let db;
  let client;

  before(async () => {
    ({ client, db } = await connectTestDb('config_cache'));
    app = createApp(db);
  });

  beforeEach(async () => {
    await clearCollections(db);
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('AC2: a limit definition created over HTTP is reflected in the cache with no restart and no explicit poll', async () => {
    const { clientId } = await createTestClient(app);
    await request(app)
      .put(`/clients/${clientId}/dimensions`)
      .send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });

    const afterRegistryWrite = app.locals.configCache.get(clientId);
    assert.ok(afterRegistryWrite, 'the registry PUT itself pushes a cache refresh');
    assert.equal(afterRegistryWrite.definitions.length, 0, 'no limit definitions exist yet');

    await request(app)
      .post(`/clients/${clientId}/limits`)
      .send({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 });

    const cached = app.locals.configCache.get(clientId);
    assert.equal(cached.registry.clientId, clientId);
    assert.equal(cached.definitions.length, 1);
    assert.equal(cached.definitions[0].thresholdAmount, 1000);
  });

  test('AC2: an update pushes a fresh snapshot reflecting the new value, replacing the old one wholesale', async () => {
    const { clientId } = await createTestClient(app);
    await request(app)
      .put(`/clients/${clientId}/dimensions`)
      .send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
    const createRes = await request(app)
      .post(`/clients/${clientId}/limits`)
      .send({ direction: 'OUTWARD', dimensionCode: 'GLOBAL', windowType: 'PER_TXN', thresholdAmount: 1000 });

    const firstEntry = app.locals.configCache.get(clientId);

    await request(app)
      .put(`/clients/${clientId}/limits/${createRes.body.data._id}`)
      .send({ thresholdAmount: 7777 });

    const secondEntry = app.locals.configCache.get(clientId);
    assert.notStrictEqual(secondEntry, firstEntry, 'the whole entry is swapped, not mutated in place');
    assert.equal(secondEntry.definitions[0].thresholdAmount, 7777);
  });

  test('AC4: two clients cached side by side never leak into each other', async () => {
    const clientA = await createTestClient(app);
    const clientB = await createTestClient(app);
    await request(app)
      .put(`/clients/${clientA.clientId}/dimensions`)
      .send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });
    await request(app)
      .put(`/clients/${clientB.clientId}/dimensions`)
      .send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['MONTHLY'] }] });

    const cachedA = app.locals.configCache.get(clientA.clientId);
    const cachedB = app.locals.configCache.get(clientB.clientId);
    assert.equal(Object.keys(cachedA.registry.directions.OUTWARD.allowedDimensions[0].windows)[0], 'DAILY_CALENDAR');
    assert.equal(Object.keys(cachedB.registry.directions.OUTWARD.allowedDimensions[0].windows)[0], 'MONTHLY');
  });

  test('warmConfigCache() loads every ACTIVE client at boot time', async () => {
    const clientA = await createTestClient(app);
    await request(app)
      .put(`/clients/${clientA.clientId}/dimensions`)
      .send({ direction: 'OUTWARD', allowedDimensions: [{ code: 'GLOBAL', attributes: [], windows: ['DAILY_CALENDAR'] }] });

    const freshApp = createApp(db);
    assert.equal(freshApp.locals.configCache.get(clientA.clientId), null);
    const warmed = await freshApp.locals.warmConfigCache();
    assert.ok(warmed.includes(clientA.clientId));
    assert.ok(freshApp.locals.configCache.get(clientA.clientId));
  });
});
