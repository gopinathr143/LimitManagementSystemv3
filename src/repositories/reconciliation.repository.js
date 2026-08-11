import { TenantScopedRepository } from './base.repository.js';
import { PRIMARY_READ_OPTS, MAJORITY_WRITE_OPTS } from '../config/database.js';
import { DRIFT_STATUS } from '../models/reconciliation.model.js';

/**
 * BRD §3.5 — the targeted-reconciliation queue. `w:majority` throughout:
 * this collection is itself part of the repair path's system of record, the
 * same reasoning `transactions` uses (BRD §4.6).
 */
export class ReconciliationRepository extends TenantScopedRepository {
  async enqueue(clientId, doc) {
    return this.insertOne(clientId, doc, MAJORITY_WRITE_OPTS);
  }

  /**
   * The sweeper drains the queue across every client in one pass, so this
   * deliberately does not go through the clientId-scoped guard — the same
   * kind of narrow, documented exception as
   * `TransactionRepository.findStalePendingClaims`.
   */
  async findAllPending(limit = 200) {
    return this.collection
      .find({ status: DRIFT_STATUS.PENDING }, PRIMARY_READ_OPTS)
      .limit(limit)
      .toArray();
  }

  /** Guarded on `status: PENDING` so a signal is never resolved twice. */
  async markResolved(clientId, id, resolution, now) {
    return this.updateOne(
      clientId,
      { _id: id, status: DRIFT_STATUS.PENDING },
      { $set: { status: DRIFT_STATUS.RESOLVED, resolvedAt: now, resolution } },
      MAJORITY_WRITE_OPTS,
    );
  }
}
