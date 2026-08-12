import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from '../integration/helpers/setup.js';
import { COUNTERS_COLLECTION, buildBootstrapDocument } from '../../src/models/counter.model.js';

/**
 * STORY-03-01 AC3/UAT 21 — "the document is removed automatically with no
 * application cleanup job running." MongoDB's TTL background monitor runs
 * roughly once every 60s, so this test genuinely waits for it rather than
 * asserting anything about the index definition — that would only prove
 * the index exists, not that expiry actually happens.
 */
describe('Counter TTL cleanup — STORY-03-01 AC3 (integration, real MongoDB replica set, slow)', () => {
  let client;
  let db;

  before(async () => {
    ({ client, db } = await connectTestDb('counter_ttl'));
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  test('a counter document whose expireAt has passed is auto-removed with no application code involved', async () => {
    const collection = db.collection(COUNTERS_COLLECTION);
    const key = 'limit:CLIENT_TTL:OUTWARD:UCIC:DAILY_CALENDAR:U1:2020-01-01';
    const now = new Date();
    // expireAt already in the past — eligible for the very next TTL sweep.
    await collection.insertOne({ _id: key, ...buildBootstrapDocument({ clientId: 'CLIENT_TTL', now, expireAt: new Date(now.getTime() - 1000) }) });

    const immediatelyAfterInsert = await collection.findOne({ _id: key });
    assert.ok(immediatelyAfterInsert, 'sanity check: the document exists right after insert');

    const deadline = Date.now() + 90_000;
    let removed = false;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      const found = await collection.findOne({ _id: key });
      if (!found) {
        removed = true;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    assert.ok(removed, 'the TTL monitor must remove the expired document within ~90s, with zero application cleanup code');
  });
});
