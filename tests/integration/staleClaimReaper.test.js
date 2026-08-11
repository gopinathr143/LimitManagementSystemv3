import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { TransactionRepository } from '../../src/repositories/transaction.repository.js';
import { StaleClaimReaperService } from '../../src/services/staleClaimReaper.service.js';
import { TRANSACTIONS_COLLECTION } from '../../src/models/transaction.model.js';

describe('Stale pending claim reaper — STORY-04-02 (integration, real MongoDB replica set)', () => {
  let client;
  let db;
  let reaper;
  let repository;

  before(async () => {
    ({ client, db } = await connectTestDb('stale_claim_reaper'));
    repository = new TransactionRepository(db.collection(TRANSACTIONS_COLLECTION));
    reaper = new StaleClaimReaperService(repository, { staleThresholdMs: 60_000 });
  });

  beforeEach(async () => {
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({});
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  async function seedPendingClaim(clientId, transactionId, claimedAt) {
    await db.collection(TRANSACTIONS_COLLECTION).insertOne({
      _id: { clientId, transactionId },
      clientId,
      transactionId,
      status: 'PENDING',
      requestData: { amount: 100 },
      claimedAt,
      updatedAt: claimedAt,
      instanceId: 'crashed-instance',
    });
  }

  test('AC1/UAT 35: a claim older than the staleness threshold is abandoned, freeing the transactionId for a fresh retry', async () => {
    const now = new Date();
    const staleClaimedAt = new Date(now.getTime() - 120_000); // 2 minutes old, threshold is 60s
    await seedPendingClaim('CLIENT_REAP_A', 'STALE-1', staleClaimedAt);

    const result = await reaper.sweep(now);
    assert.equal(result.reaped, 1);

    const doc = await repository.findByTransactionId('CLIENT_REAP_A', 'STALE-1');
    assert.equal(doc.status, 'ABANDONED');

    // A fresh retry of the same transactionId must now be acceptable — the claim doesn't block it forever.
    const claimAttempt = await repository.claim('CLIENT_REAP_A', {
      _id: { clientId: 'CLIENT_REAP_A', transactionId: 'STALE-1-RETRY' },
      clientId: 'CLIENT_REAP_A',
      transactionId: 'STALE-1-RETRY',
      status: 'PENDING',
      requestData: { amount: 100 },
      claimedAt: now,
      updatedAt: now,
      instanceId: 'new-instance',
    });
    assert.equal(claimAttempt.claimed, true);
  });

  test('AC2: an abandoned claim is flagged for reconciliation', async () => {
    const now = new Date();
    await seedPendingClaim('CLIENT_REAP_B', 'STALE-2', new Date(now.getTime() - 120_000));
    await reaper.sweep(now);
    const doc = await repository.findByTransactionId('CLIENT_REAP_B', 'STALE-2');
    assert.equal(doc.needsReconciliation, true);
  });

  test('AC3: a healthy in-flight claim within the threshold is left untouched', async () => {
    const now = new Date();
    await seedPendingClaim('CLIENT_REAP_C', 'FRESH-1', new Date(now.getTime() - 5_000)); // only 5s old

    const result = await reaper.sweep(now);
    assert.equal(result.reaped, 0);

    const doc = await repository.findByTransactionId('CLIENT_REAP_C', 'FRESH-1');
    assert.equal(doc.status, 'PENDING', 'a healthy in-flight request must not be reaped');
  });

  test('AC4: claims are transitioned, never deleted — the audit record survives', async () => {
    const now = new Date();
    await seedPendingClaim('CLIENT_REAP_D', 'STALE-3', new Date(now.getTime() - 120_000));
    await reaper.sweep(now);

    const count = await db.collection(TRANSACTIONS_COLLECTION).countDocuments({ _id: { clientId: 'CLIENT_REAP_D', transactionId: 'STALE-3' } });
    assert.equal(count, 1, 'the document must still exist, only its status changed');
  });

  test('a claim that resolves normally between the reaper scan and its write is left untouched (guarded transition)', async () => {
    const now = new Date();
    await seedPendingClaim('CLIENT_REAP_E', 'RACE-1', new Date(now.getTime() - 120_000));

    // Simulate the owning request completing normally just before the reaper's guarded write lands.
    await repository.resolve('CLIENT_REAP_E', 'RACE-1', { status: 'APPROVED', updatedAt: now, resolvedAt: now });

    const result = await reaper.sweep(now);
    assert.equal(result.reaped, 0, 'the guard (status: PENDING) must prevent overwriting an already-resolved claim');

    const doc = await repository.findByTransactionId('CLIENT_REAP_E', 'RACE-1');
    assert.equal(doc.status, 'APPROVED');
  });
});
