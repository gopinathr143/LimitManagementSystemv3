import { TenantScopedRepository } from './base.repository.js';
import { PRIMARY_READ_OPTS, MAJORITY_WRITE_OPTS } from '../config/database.js';
import { TRANSACTION_STATUS } from '../constants/index.js';

const MONGO_DUPLICATE_KEY = 11000;

/**
 * BRD §3.1 — the idempotency mutex. `_id` is the compound
 * `{clientId, transactionId}` primary key, so the unique index that makes
 * this a true mutex needs no secondary index (STORY-04-01 DoD).
 *
 * BRD §4.6 — "the claim insert and status resolution use w:majority, since
 * `transactions` is the system of record." Every write here uses
 * MAJORITY_WRITE_OPTS, never the hot-path w:1 counters use.
 */
export class TransactionRepository extends TenantScopedRepository {
  /** Returns `{claimed:true, doc}` if this call won the mutex, or `{claimed:false, existing}` if a claim already exists (BRD §3.1 step 3). */
  async claim(clientId, doc) {
    try {
      await this.insertOne(clientId, doc, MAJORITY_WRITE_OPTS);
      return { claimed: true, doc };
    } catch (error) {
      if (error?.code !== MONGO_DUPLICATE_KEY) {
        throw error;
      }
      const existing = await this.findByTransactionId(clientId, doc.transactionId);
      return { claimed: false, existing };
    }
  }

  /** Guarded on `status: PENDING` so only the claim's owner can resolve it — a second resolve attempt is a no-op (`matchedCount === 0`). */
  async resolve(clientId, transactionId, setFields) {
    return this.updateOne(
      clientId,
      { _id: { clientId, transactionId }, status: TRANSACTION_STATUS.PENDING },
      { $set: setFields },
      MAJORITY_WRITE_OPTS,
    );
  }

  async findByTransactionId(clientId, transactionId) {
    return this.findOne(clientId, { _id: { clientId, transactionId } }, PRIMARY_READ_OPTS);
  }

  /**
   * BRD §3.4 — "the status flip is attempted first; only on matchedCount===1
   * are decrements applied." `returnDocument: 'before'` hands back the
   * pre-flip document (still `APPROVED`, `appliedCounterKeys` intact) in the
   * SAME round trip the flip itself uses, so the caller never re-reads and
   * never risks acting on a second, later version of the document. A `null`
   * result means the filter didn't match — the caller distinguishes
   * already-reversed / non-reversible / non-existent via a follow-up read.
   */
  async reverseIfApproved(clientId, transactionId, { reason, now }) {
    return this.findOneAndUpdate(
      clientId,
      { _id: { clientId, transactionId }, status: TRANSACTION_STATUS.APPROVED },
      { $set: { status: TRANSACTION_STATUS.REVERSED, reversedAt: now, updatedAt: now, reversalReason: reason ?? null } },
      { returnDocument: 'before', ...MAJORITY_WRITE_OPTS },
    );
  }

  /**
   * BRD §3.5 — the derivation source for reconciliation. Every applied-key
   * entry records the EXACT physical document a transaction wrote to
   * (STORY-04-05: for a Tier 2 shard, that's the specific shard's own key,
   * not the logical base key) — so summing `appliedCounterKeys` deltas
   * across every still-APPROVED transaction that named `counterKey` is the
   * expected value for that one document, tier1 or tier2 shard alike, with
   * no grouping or prefix-matching required. A REVERSED transaction
   * contributes nothing — its effect is defined to be fully undone; if the
   * physical decrement silently failed, that disagreement IS the drift this
   * exists to catch.
   */
  async deriveExpectedCounterTotal(clientId, counterKey) {
    const pipeline = [
      { $match: { clientId, status: TRANSACTION_STATUS.APPROVED, appliedCounterKeys: { $elemMatch: { key: counterKey } } } },
      { $unwind: '$appliedCounterKeys' },
      { $match: { 'appliedCounterKeys.key': counterKey } },
      { $group: { _id: null, amount: { $sum: '$appliedCounterKeys.amountDelta' }, count: { $sum: '$appliedCounterKeys.countDelta' } } },
    ];
    const [result] = await this.collection.aggregate(pipeline, PRIMARY_READ_OPTS).toArray();
    return { amount: result?.amount ?? 0, count: result?.count ?? 0 };
  }

  /**
   * BRD §3.1.1 — the stale-claim reaper scans across ALL clients, so this
   * deliberately does not go through the clientId-scoped guard (the same
   * kind of narrow, documented exception as `ClientRepository.findByApiKeyHash`).
   */
  async findStalePendingClaims(staleBeforeDate, limit = 100) {
    return this.collection
      .find({ status: TRANSACTION_STATUS.PENDING, claimedAt: { $lt: staleBeforeDate } }, PRIMARY_READ_OPTS)
      .limit(limit)
      .toArray();
  }

  /**
   * Guarded the same way as `resolve` — a claim that completed normally
   * between the reaper's scan and this write is left untouched.
   * `needsReconciliation: true` is the hand-off point for EPIC-05's
   * reconciliation sweeper (not yet built): a crashed request may have
   * applied increments this process could never compensate.
   */
  async abandon(clientId, transactionId, now) {
    return this.resolve(clientId, transactionId, {
      status: TRANSACTION_STATUS.ABANDONED,
      abandonedAt: now,
      updatedAt: now,
      needsReconciliation: true,
    });
  }
}
