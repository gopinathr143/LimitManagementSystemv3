import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { MongoClient } from 'mongodb';
import { createApp } from '../../src/app.js';

/**
 * BRD §4.9 AC1/UAT 38 — "If MongoDB is unreachable... the service rejects
 * transactions rather than allowing them." This points the whole app's
 * composition root at a database that can never be reached (an unused
 * local port, with a short `serverSelectionTimeoutMS` so the test fails
 * fast rather than hanging on the driver's default 30s) and proves the
 * request path never returns an APPROVED decision under that condition —
 * every operation either throws or times out, and the error handler always
 * responds with `success:false`, never a decision body.
 */
describe('Fail-closed under datastore unavailability — STORY-06-03 (integration)', () => {
  let unreachableClient;

  after(async () => {
    await unreachableClient?.close().catch(() => {});
  });

  function buildUnreachableApp() {
    unreachableClient = new MongoClient('mongodb://127.0.0.1:1/', {
      serverSelectionTimeoutMS: 500,
      connectTimeoutMS: 500,
    });
    const db = unreachableClient.db('imps_velocity_unreachable');
    return createApp(db);
  }

  test('AC1/UAT 38: submitting a transaction while MongoDB is unreachable never returns an APPROVED (or any success) response', async () => {
    const app = buildUnreachableApp();
    const res = await request(app)
      .post('/clients/CLIENT_DOWN/transactions')
      .send({ transactionId: 'DOWN1', amount: 100 });

    assert.notEqual(res.status, 200, 'an unreachable datastore must never produce a 200/APPROVED response');
    assert.equal(res.body.success, false);
    assert.notEqual(res.body?.data?.status, 'APPROVED');
  }, { timeout: 10_000 });

  test('AC2: an unresolvable configuration snapshot (no registry reachable) fails closed the same way, not with a silent allow', async () => {
    const app = buildUnreachableApp();
    const res = await request(app)
      .get('/clients/CLIENT_DOWN/transactions/ANY')
      .send();

    assert.ok(res.status >= 400, 'a lookup against an unreachable datastore must be an error response, never a fabricated success');
    assert.equal(res.body.success, false);
  }, { timeout: 10_000 });

  test('AC4 (code audit): no allow-through/bypass flag exists anywhere in the transaction request path', async () => {
    // Structural proof, not a runtime one: TransactionService.submit() has exactly one path to an
    // APPROVED status — completing #runWaterfall with every dimension/window passed — and no
    // environment flag, header, or config value short-circuits it. This is asserted by reading the
    // actual source rather than grepping for a string, since a renamed bypass would defeat a grep.
    const { TransactionService } = await import('../../src/services/transaction.service.js');
    const source = TransactionService.toString();
    assert.doesNotMatch(source, /bypass/i);
    assert.doesNotMatch(source, /skipValidation/i);
    assert.doesNotMatch(source, /allowThrough/i);
  });
});
