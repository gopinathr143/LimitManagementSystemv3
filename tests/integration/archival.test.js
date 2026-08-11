import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectTestDb, disconnectTestDb } from './helpers/setup.js';
import { TransactionRepository } from '../../src/repositories/transaction.repository.js';
import { TransactionArchiveRepository } from '../../src/repositories/transactionArchive.repository.js';
import { RegistryRepository } from '../../src/repositories/registry.repository.js';
import { LimitDefinitionRepository } from '../../src/repositories/limitDefinition.repository.js';
import { CounterRepository } from '../../src/repositories/counter.repository.js';
import { ArchivalService, DEFAULT_HOT_RETENTION_MS } from '../../src/services/archival.service.js';
import { TransactionService } from '../../src/services/transaction.service.js';
import { CounterEngineService } from '../../src/services/counterEngine.service.js';
import { ConfigCache } from '../../src/services/configCache.service.js';
import { TRANSACTIONS_COLLECTION, TRANSACTIONS_ARCHIVE_COLLECTION } from '../../src/models/transaction.model.js';
import { COUNTERS_COLLECTION } from '../../src/models/counter.model.js';
import { CLIENT_CONFIGS_COLLECTION } from '../../src/models/registry.model.js';
import { LIMITS_COLLECTION } from '../../src/models/limitDefinition.model.js';

const NINETY_ONE_DAYS_MS = 91 * 24 * 60 * 60 * 1000;

describe('Transaction archival — STORY-06-01 (integration, real MongoDB)', () => {
  let client;
  let db;
  let transactionRepository;
  let archiveRepository;
  let archivalService;

  before(async () => {
    ({ client, db } = await connectTestDb('archival'));
    transactionRepository = new TransactionRepository(db.collection(TRANSACTIONS_COLLECTION));
    archiveRepository = new TransactionArchiveRepository(db.collection(TRANSACTIONS_ARCHIVE_COLLECTION));
    archivalService = new ArchivalService(transactionRepository, archiveRepository, { hotRetentionMs: 90 * 24 * 60 * 60 * 1000 });
  });

  beforeEach(async () => {
    await db.collection(TRANSACTIONS_COLLECTION).deleteMany({});
    await db.collection(TRANSACTIONS_ARCHIVE_COLLECTION).deleteMany({});
  });

  after(async () => {
    await disconnectTestDb(client);
  });

  async function seedTerminal(clientId, transactionId, status, updatedAt) {
    const doc = {
      _id: { clientId, transactionId },
      clientId,
      transactionId,
      status,
      requestData: { amount: 500 },
      claimedAt: updatedAt,
      updatedAt,
      resolvedAt: updatedAt,
      appliedCounterKeys: [],
    };
    await db.collection(TRANSACTIONS_COLLECTION).insertOne(doc);
    return doc;
  }

  test('AC2: a terminal record past the hot-retention cutoff is moved to the archive collection and remains retrievable by its compound key', async () => {
    const now = new Date();
    const oldEnough = new Date(now.getTime() - NINETY_ONE_DAYS_MS);
    await seedTerminal('CLIENT_ARCH_A', 'OLD1', 'APPROVED', oldEnough);

    const result = await archivalService.sweep(now);
    assert.equal(result.archived, 1);

    const stillInHot = await transactionRepository.findByTransactionId('CLIENT_ARCH_A', 'OLD1');
    assert.equal(stillInHot, null, 'the record must be removed from the hot collection once archived');

    const archived = await archiveRepository.findByTransactionId('CLIENT_ARCH_A', 'OLD1');
    assert.ok(archived, 'the record must be retrievable from the archive by the same compound key');
    assert.equal(archived.status, 'APPROVED');
    assert.equal(archived.requestData.amount, 500);
  });

  test('a record within the hot-retention window is left untouched', async () => {
    const now = new Date();
    await seedTerminal('CLIENT_ARCH_B', 'RECENT1', 'APPROVED', now);

    const result = await archivalService.sweep(now);
    assert.equal(result.archived, 0);

    const stillInHot = await transactionRepository.findByTransactionId('CLIENT_ARCH_B', 'RECENT1');
    assert.ok(stillInHot, 'a recent record must stay in the hot collection');
    const archived = await archiveRepository.findByTransactionId('CLIENT_ARCH_B', 'RECENT1');
    assert.equal(archived, null);
  });

  test('a PENDING claim is never archived regardless of age — that is the stale-claim reaper\'s concern, not this sweep\'s', async () => {
    const now = new Date();
    const oldEnough = new Date(now.getTime() - NINETY_ONE_DAYS_MS);
    await db.collection(TRANSACTIONS_COLLECTION).insertOne({
      _id: { clientId: 'CLIENT_ARCH_C', transactionId: 'OLDPENDING' },
      clientId: 'CLIENT_ARCH_C',
      transactionId: 'OLDPENDING',
      status: 'PENDING',
      requestData: { amount: 500 },
      claimedAt: oldEnough,
      updatedAt: oldEnough,
    });

    const result = await archivalService.sweep(now);
    assert.equal(result.archived, 0);
    const stillInHot = await transactionRepository.findByTransactionId('CLIENT_ARCH_C', 'OLDPENDING');
    assert.ok(stillInHot, 'a PENDING claim must never be archived, however old');
  });

  test('a sweep re-run after a partial failure is idempotent (duplicate insertArchived is swallowed, not an error)', async () => {
    const now = new Date();
    const oldEnough = new Date(now.getTime() - NINETY_ONE_DAYS_MS);
    const doc = await seedTerminal('CLIENT_ARCH_D', 'RETRY1', 'REJECTED', oldEnough);

    // Simulate the crash-between-copy-and-delete case: pre-populate the archive, leave the hot record in place.
    await archiveRepository.insertArchived('CLIENT_ARCH_D', doc);

    const result = await archivalService.sweep(now);
    assert.equal(result.archived, 1, 'the sweep must still complete the delete step on retry, even though the copy already existed');
    const stillInHot = await transactionRepository.findByTransactionId('CLIENT_ARCH_D', 'RETRY1');
    assert.equal(stillInHot, null);
  });

  test('TransactionService.getStatus falls back to the archive once a record has aged out of the hot collection', async () => {
    const transactionRepo = new TransactionRepository(db.collection(TRANSACTIONS_COLLECTION));
    const archiveRepo = new TransactionArchiveRepository(db.collection(TRANSACTIONS_ARCHIVE_COLLECTION));
    const registryRepository = new RegistryRepository(db.collection(CLIENT_CONFIGS_COLLECTION));
    const limitDefinitionRepository = new LimitDefinitionRepository(db.collection(LIMITS_COLLECTION));
    const counterRepository = new CounterRepository(db.collection(COUNTERS_COLLECTION));
    const configCache = new ConfigCache(registryRepository, limitDefinitionRepository);
    const counterEngineService = new CounterEngineService(counterRepository, configCache);
    const transactionService = new TransactionService(transactionRepo, configCache, counterEngineService, { transactionArchiveRepository: archiveRepo });

    const now = new Date();
    const oldEnough = new Date(now.getTime() - NINETY_ONE_DAYS_MS);
    await seedTerminal('CLIENT_ARCH_E', 'ARCHIVED1', 'APPROVED', oldEnough);
    await archivalService.sweep(now);

    const status = await transactionService.getStatus('CLIENT_ARCH_E', 'ARCHIVED1');
    assert.equal(status.status, 'APPROVED');
    assert.equal(status.transactionId, 'ARCHIVED1');
  });

  test('the default hot-retention window matches BRD §4.7 (90 days)', () => {
    assert.equal(DEFAULT_HOT_RETENTION_MS, 90 * 24 * 60 * 60 * 1000);
  });
});
