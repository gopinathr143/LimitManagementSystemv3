import { logger } from '../config/logger.js';

const DEFAULT_STALE_THRESHOLD_MS = 60_000;

/**
 * BRD §3.1.1 — a process that crashes mid-waterfall leaves an orphaned
 * PENDING claim that would otherwise block legitimate retries of that
 * transaction forever. This sweeps for claims older than the staleness
 * threshold and transitions them to ABANDONED — a status change, never a
 * delete (STORY-04-02 AC4), so the audit record survives.
 */
export class StaleClaimReaperService {
  constructor(transactionRepository, { staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS } = {}) {
    this.transactionRepository = transactionRepository;
    this.staleThresholdMs = staleThresholdMs;
    this.timer = null;
  }

  /** Directly callable/testable — the periodic timer (`start()`) just calls this on an interval. */
  async sweep(now = new Date()) {
    const staleBefore = new Date(now.getTime() - this.staleThresholdMs);
    const staleClaims = await this.transactionRepository.findStalePendingClaims(staleBefore);

    let reaped = 0;
    for (const claim of staleClaims) {
      // eslint-disable-next-line no-await-in-loop
      const result = await this.transactionRepository.abandon(claim.clientId, claim.transactionId, now);
      if (result.matchedCount === 1) {
        reaped += 1;
        // BRD §3.5 — the reconciliation sweeper (EPIC-05, not yet built) is the authoritative
        // repair path for any increments this crashed request could not itself compensate;
        // `needsReconciliation: true` on the abandoned doc is the hand-off point.
        logger.warn({ clientId: claim.clientId, transactionId: claim.transactionId }, 'Stale PENDING claim abandoned; referred to reconciliation');
      }
      // matchedCount === 0 means the claim resolved normally between the scan and this write — AC3, left untouched.
    }
    return { scanned: staleClaims.length, reaped };
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.sweep().catch((error) => logger.error({ err: error }, 'Stale claim reaper sweep failed'));
    }, this.staleThresholdMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
