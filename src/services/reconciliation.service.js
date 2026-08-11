import { logger } from '../config/logger.js';
import { buildDriftSignalDocument } from '../models/reconciliation.model.js';

const DEFAULT_QUEUE_POLL_INTERVAL_MS = 30_000;
const DEFAULT_CLOSED_WINDOW_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — a closed window stays reconcilable for its whole 90-day retention (BRD §4.7), so this is a cadence choice, not a deadline.

/**
 * BRD §3.5 — the reconciliation sweeper. `transactions` is the system of
 * record and already carries every applied counter key (STORY-04-05), so a
 * live counter document is always independently re-derivable and therefore
 * repairable. Two paths, per the BRD:
 *
 *  - `processQueue` — targeted, immediate: drains signals raised by a known
 *    failure (a compensation or reversal floor-guard miss) rather than
 *    waiting for the periodic sweep (AC2).
 *  - `sweepClosedWindows` — the general/nightly pass over every closed-window
 *    flat counter, per client (AC5).
 *
 * Both funnel through `#reconcileOne`, which is deliberately conservative:
 * a CLOSED window's drift is corrected; an OPEN window's drift is alerted
 * only, unless `autoCorrectOpenWindows` is explicitly enabled — "silently
 * rewriting a live risk counter is itself a risk" (BRD §3.5 AC3).
 *
 * Scope note: DAILY_ROLLING counters (identified by their `buckets` shape)
 * are never auto-corrected by this service, targeted or general. A rolling
 * window has no "closed" state — it is a continuous 24h sliding horizon —
 * so the BRD's own closed-window auto-correct trigger structurally doesn't
 * apply to it; a rolling drift signal is always alert-only.
 */
export class ReconciliationService {
  constructor(counterRepository, transactionRepository, reconciliationRepository, options = {}) {
    this.counterRepository = counterRepository;
    this.transactionRepository = transactionRepository;
    this.reconciliationRepository = reconciliationRepository;
    this.clientRepository = options.clientRepository ?? null;
    // BRD §4.11 AC2 — optional so every existing caller keeps working unwired.
    this.metricsService = options.metricsService ?? null;
    this.autoCorrectOpenWindows = options.autoCorrectOpenWindows === true;
    this.queuePollIntervalMs = options.queuePollIntervalMs ?? DEFAULT_QUEUE_POLL_INTERVAL_MS;
    this.closedWindowSweepIntervalMs = options.closedWindowSweepIntervalMs ?? DEFAULT_CLOSED_WINDOW_SWEEP_INTERVAL_MS;
    this.queueTimer = null;
    this.sweepTimer = null;
  }

  /** BRD §3.5 AC2 — called by TransactionService the moment a floor guard fails; never waits for a scan. */
  async queueDrift(clientId, applied) {
    const doc = buildDriftSignalDocument({
      clientId,
      counterKey: applied.key,
      tier: applied.tier,
      sourceTransactionId: applied.sourceTransactionId,
      reason: applied.reason,
      now: new Date(),
    });
    await this.reconciliationRepository.enqueue(clientId, doc);
  }

  /** Directly callable/testable — the periodic timer just calls this on an interval. */
  async processQueue(now = new Date()) {
    const pending = await this.reconciliationRepository.findAllPending();
    const results = [];
    for (const signal of pending) {
      // Rolling-tier signals are alert-only by design (see class doc) — never routed through the flat-counter corrector.
      // eslint-disable-next-line no-await-in-loop
      const outcome = signal.tier === 'rolling' || signal.tier === 'rolling-sharded' ? await this.#alertRollingDrift(signal, now) : await this.#reconcileOne(signal.clientId, signal.counterKey, now);
      // eslint-disable-next-line no-await-in-loop
      await this.reconciliationRepository.markResolved(signal.clientId, signal._id, outcome, now);
      results.push({ clientId: signal.clientId, counterKey: signal.counterKey, outcome });
    }
    return { processed: pending.length, results };
  }

  /** Directly callable/testable — the periodic timer just calls this on an interval. */
  async sweepClosedWindows(clientIds, now = new Date()) {
    const summary = [];
    for (const clientId of clientIds) {
      // eslint-disable-next-line no-await-in-loop
      const docs = await this.counterRepository.findFlatCountersDueForSweep(clientId, now);
      for (const doc of docs) {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await this.#reconcileOne(clientId, doc._id, now, { isClosed: true });
        summary.push({ clientId, key: doc._id, outcome });
      }
    }
    return summary;
  }

  async #alertRollingDrift(signal, now) {
    logger.error({ clientId: signal.clientId, counterKey: signal.counterKey, reason: signal.reason }, 'Rolling-window drift signal — alert-only by design, no auto-correction');
    return { action: 'ALERTED', drifted: null, note: 'rolling counters are never auto-corrected', resolvedAt: now };
  }

  /**
   * A live document that no longer exists (targeted signal racing a natural
   * TTL expiry) is not drift — there is nothing to compare or correct, so
   * this returns early rather than flagging the window's whole transaction
   * history as "missing" (BRD §3.4 point 2's "skip if TTL-expired", applied
   * here to reconciliation).
   */
  async #reconcileOne(clientId, counterKey, now, { isClosed } = {}) {
    const liveDoc = await this.counterRepository.findByKey(clientId, counterKey);
    if (!liveDoc) {
      return { action: 'DOC_GONE', drifted: false };
    }

    const expected = await this.transactionRepository.deriveExpectedCounterTotal(clientId, counterKey);
    const actual = { amount: liveDoc.amount ?? 0, count: liveDoc.count ?? 0 };
    const amountDrift = actual.amount - expected.amount;
    const countDrift = actual.count - expected.count;
    const drifted = amountDrift !== 0 || countDrift !== 0;

    if (!drifted) {
      return { action: 'NONE', drifted: false };
    }

    logger.error({ clientId, counterKey, actual, expected, amountDrift, countDrift }, 'Counter drift detected');

    const closed = isClosed ?? liveDoc.expireAt <= now;
    if (!closed && !this.autoCorrectOpenWindows) {
      // BRD §3.5 AC3 — open-window drift is alert-first; auto-correction only where policy permits.
      this.metricsService?.recordDrift(clientId, 'ALERTED');
      return { action: 'ALERTED', drifted: true, actual, expected };
    }

    await this.counterRepository.correctCounterValue(clientId, counterKey, { amount: expected.amount, count: expected.count, now });
    logger.warn({ clientId, counterKey, correctedTo: expected }, 'Counter drift corrected');
    this.metricsService?.recordDrift(clientId, 'CORRECTED');
    return { action: 'CORRECTED', drifted: true, actual, expected };
  }

  start() {
    if (this.queueTimer || this.sweepTimer) {
      return;
    }
    this.queueTimer = setInterval(() => {
      this.processQueue().catch((error) => logger.error({ err: error }, 'Reconciliation queue processing failed'));
    }, this.queuePollIntervalMs);
    this.queueTimer.unref?.();

    if (this.clientRepository) {
      this.sweepTimer = setInterval(() => {
        this.clientRepository
          .listActiveClientIds()
          .then((clientIds) => this.sweepClosedWindows(clientIds))
          .catch((error) => logger.error({ err: error }, 'Reconciliation closed-window sweep failed'));
      }, this.closedWindowSweepIntervalMs);
      this.sweepTimer.unref?.();
    }
  }

  stop() {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}
