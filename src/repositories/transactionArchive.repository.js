import { TenantScopedRepository } from './base.repository.js';
import { PRIMARY_READ_OPTS, MAJORITY_WRITE_OPTS } from '../config/database.js';

const MONGO_DUPLICATE_KEY = 11000;

/**
 * BRD §4.7 — the cold-tier collection. Same compound `_id`
 * `{clientId, transactionId}` as the hot `transactions` collection, so a
 * record is addressable by exactly the same key whether it's hot or
 * archived (AC2: "remain retrievable by the compound client and
 * transaction identifier").
 */
export class TransactionArchiveRepository extends TenantScopedRepository {
  /** Idempotent: a duplicate insert (the archival sweep retrying after a crash between copy and delete) is swallowed, not an error. */
  async insertArchived(clientId, doc) {
    try {
      await this.insertOne(clientId, doc, MAJORITY_WRITE_OPTS);
    } catch (error) {
      if (error?.code !== MONGO_DUPLICATE_KEY) {
        throw error;
      }
    }
  }

  async findByTransactionId(clientId, transactionId) {
    return this.findOne(clientId, { _id: { clientId, transactionId } }, PRIMARY_READ_OPTS);
  }
}
