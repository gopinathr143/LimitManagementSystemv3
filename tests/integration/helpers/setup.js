import './env.js';
import { MongoClient } from 'mongodb';
import request from 'supertest';
import { env } from '../../../src/config/env.js';
import { createApp } from '../../../src/app.js';
import { initDb } from '../../../scripts/init-db.js';

/**
 * Real MongoDB replica set only — per every EPIC-01 story's DoD
 * ("Integration test runs against a real MongoDB replica set, not an
 * in-memory mock"). Requires `yarn mongo:up` (docker-compose, single-node
 * rs0) to be running first.
 *
 * Deliberately NOT a module-level singleton: `node --test` with multiple
 * file arguments runs them concurrently in one process, and this helper
 * module is the same cached ES module across all of them — a shared
 * client/db would let one file's `after()` teardown close the connection
 * out from under another file's still-running tests. Each test file owns
 * its own handle.
 *
 * Each caller also gets its own logical database (`<dbName>_<dbSuffix>`),
 * not just its own client — otherwise two files running concurrently
 * against the *same* database would have one file's `beforeEach`
 * `deleteMany({})` wipe data a concurrently-running test in another file
 * was mid-way through asserting on. `dbSuffix` should be unique per test
 * file (e.g. the filename).
 */
export async function connectTestDb(dbSuffix) {
  const client = new MongoClient(env.mongo.uri);
  await client.connect();
  const dbName = dbSuffix ? `${env.mongo.dbName}_${dbSuffix}` : env.mongo.dbName;
  const db = client.db(dbName);
  await initDb(client, dbName);
  return { client, db };
}

export async function disconnectTestDb(client) {
  await client?.close();
}

export async function clearCollections(db) {
  await db.collection('clients').deleteMany({});
  await db.collection('configAudit').deleteMany({});
  await db.collection('clientConfigs').deleteMany({});
  await db.collection('limits').deleteMany({});
  await db.collection('limitsAudit').deleteMany({});
}

/** EPIC-02 helper: onboard a client via HTTP and return its clientId + apiKey, ready for tenant-authenticated calls. */
export async function createTestClient(app, overrides = {}) {
  const clientId = overrides.clientId ?? `CLIENT_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const res = await request(app)
    .post('/clients')
    .set(adminHeaders())
    .send({ clientId, name: overrides.name ?? clientId, timezone: overrides.timezone ?? 'Asia/Kolkata' });
  return { clientId, apiKey: res.body.data.apiKey };
}

export function adminHeaders() {
  return { 'x-admin-api-key': env.auth.adminApiKeys[0] };
}

export { createApp };
