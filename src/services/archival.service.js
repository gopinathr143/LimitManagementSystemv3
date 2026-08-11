import { logger } from '../config/logger.js';

export const DEFAULT_HOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // BRD §4.7 — "retain a configurable 90 days in the live transactions collection."
const DEFAULT_BATCH_LIMIT = 500;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // Hourly cadence is a policy choice, not a BRD-specified number — a 90-day-old record has no urgency.

/**
 * BRD §4.7 — moves terminal-status records past the hot-retention window
 * out of the live `transactions` collection, which is what keeps that
 * collection's size bounded rather than growing forever at ~86M docs/day.
 *
 * Copy-then-delete, in that order, never reversed: if the process crashes
 * between the two steps, the record is briefly duplicated in both
 * collections (harmless — `insertArchived` is idempotent on retry) rather
 * than lost from both. A record still `PENDING` is never a candidate — an
 * in-flight or crashed claim is the stale-claim reaper's concern
 * (STORY-04-02), not this sweep's.
 */
export class ArchivalService {
  constructor(transactionRepository, transactionArchiveRepository, options = {}) {
    this.transactionRepository = transactionRepository;
    this.transactionArchiveRepository = transactionArchiveRepository;
    this.hotRetentionMs = options.hotRetentionMs ?? DEFAULT_HOT_RETENTION_MS;
    this.batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;
    this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.timer = null;
  }

  /** Directly callable/testable — the periodic timer just calls this on an interval. */
  async sweep(now = new Date()) {
    const cutoff = new Date(now.getTime() - this.hotRetentionMs);
    const candidates = await this.transactionRepository.findTerminalOlderThan(cutoff, this.batchLimit);

    let archived = 0;
    for (const doc of candidates) {
      // eslint-disable-next-line no-await-in-loop
      await this.transactionArchiveRepository.insertArchived(doc.clientId, doc);
      // eslint-disable-next-line no-await-in-loop
      const result = await this.transactionRepository.deleteArchived(doc.clientId, doc.transactionId);
      if (result.deletedCount === 1) {
        archived += 1;
      }
    }
    if (archived > 0) {
      logger.info({ archived, cutoff }, 'Archived terminal transactions past the hot-retention window');
    }
    return { scanned: candidates.length, archived };
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.sweep().catch((error) => logger.error({ err: error }, 'Archival sweep failed'));
    }, this.sweepIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
