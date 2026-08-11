export const RECONCILIATION_QUEUE_COLLECTION = 'reconciliationQueue';

/** BRD §3.5 — the two failure signals that skip the periodic sweep and go straight to targeted reconciliation. */
export const DRIFT_REASON = Object.freeze({
  COMPENSATION_FLOOR_GUARD_FAILED: 'COMPENSATION_FLOOR_GUARD_FAILED',
  REVERSAL_FLOOR_GUARD_FAILED: 'REVERSAL_FLOOR_GUARD_FAILED',
});

export const DRIFT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
});

/** BRD §3.5 AC2 — "queued for targeted reconciliation rather than waiting for the periodic sweep." One entry per failed decrement; `counterKey` is the exact physical document (tier1 doc or one Tier 2 shard) that failed its floor guard. */
export function buildDriftSignalDocument({ clientId, counterKey, tier, sourceTransactionId, reason, now }) {
  return {
    clientId,
    counterKey,
    tier,
    sourceTransactionId,
    reason,
    status: DRIFT_STATUS.PENDING,
    createdAt: now,
    resolvedAt: null,
    resolution: null,
  };
}
