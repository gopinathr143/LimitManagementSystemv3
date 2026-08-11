import client from 'prom-client';

/**
 * BRD §4.11 — "Compensation failure rate and counter drift are the two
 * leading indicators that the system is quietly deciding wrongly." This
 * wraps `prom-client` (correct histogram/percentile math, rather than
 * hand-rolled quantile estimation — the same reasoning that keeps luxon in
 * charge of timezone boundary math elsewhere in this codebase) behind a
 * small named-metric API, so call sites never touch `prom-client` directly
 * and the metric catalogue lives in exactly one place.
 */
export class MetricsService {
  constructor(options = {}) {
    this.registry = options.registry ?? new client.Registry();
    if (options.collectDefaultMetrics !== false) {
      client.collectDefaultMetrics({ register: this.registry });
    }

    this.decisions = new client.Counter({
      name: 'imps_transaction_decisions_total',
      help: 'Transaction decisions by outcome, per client (BRD §4.11 AC1).',
      labelNames: ['clientId', 'outcome'],
      registers: [this.registry],
    });

    this.rejections = new client.Counter({
      name: 'imps_transaction_rejections_total',
      help: 'Rejections broken down by breached dimension, window and metric, per client (BRD §4.11 AC1).',
      labelNames: ['clientId', 'dimensionCode', 'windowType', 'metric'],
      registers: [this.registry],
    });

    this.inProgress = new client.Counter({
      name: 'imps_transaction_in_progress_total',
      help: 'Requests that found an in-flight PENDING claim and received 409 (BRD §4.11 AC1).',
      labelNames: ['clientId'],
      registers: [this.registry],
    });

    this.errors = new client.Counter({
      name: 'imps_transaction_errors_total',
      help: 'Requests that ended in an application error rather than a decision (BRD §4.11 AC1).',
      labelNames: ['clientId', 'code'],
      registers: [this.registry],
    });

    this.floorGuardFailures = new client.Counter({
      name: 'imps_floor_guard_failures_total',
      help: 'Compensation or reversal decrements that failed their floor guard — a drift signal (BRD §4.11 AC2).',
      labelNames: ['clientId', 'tier', 'source'],
      registers: [this.registry],
    });

    this.counterDrift = new client.Counter({
      name: 'imps_counter_drift_total',
      help: 'Reconciliation comparisons where the live counter disagreed with the transactions-derived value (BRD §4.11 AC2).',
      labelNames: ['clientId', 'action'],
      registers: [this.registry],
    });

    this.retryAttempts = new client.Counter({
      name: 'imps_counter_retry_attempts_total',
      help: 'Transient-error retries attempted, per counter tier (BRD §4.11 AC3).',
      labelNames: ['tier'],
      registers: [this.registry],
    });

    this.retryExhausted = new client.Counter({
      name: 'imps_counter_retry_exhausted_total',
      help: 'Retries that exhausted every attempt and still failed, per counter tier — an early warning of an undersized shard factor (BRD §4.11 AC3).',
      labelNames: ['tier'],
      registers: [this.registry],
    });

    this.tierLatency = new client.Histogram({
      name: 'imps_counter_tier_duration_seconds',
      help: 'Latency of a single counter-tier check-and-increment call (BRD §4.11 AC4).',
      labelNames: ['tier'],
      buckets: [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });

    this.requestLatency = new client.Histogram({
      name: 'imps_transaction_request_duration_seconds',
      help: 'End-to-end latency of a transaction submission (BRD §4.11 AC4).',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.7, 1, 2],
      registers: [this.registry],
    });

    this.replicationLagSeconds = new client.Gauge({
      name: 'imps_replication_lag_seconds',
      help: 'Observed replication lag of the furthest-behind secondary as of the last check (BRD §4.11 AC5).',
      registers: [this.registry],
    });
  }

  recordDecision(clientId, outcome) {
    this.decisions.inc({ clientId, outcome });
  }

  /** `metrics` is the breach's metric list (e.g. `['AMOUNT']`, `['AMOUNT','COUNT']`) — one increment per metric, so a dual breach counts on both. */
  recordRejection(clientId, { dimensionCode, windowType, metrics }) {
    const metricLabels = metrics?.length ? metrics : ['NONE'];
    for (const metric of metricLabels) {
      this.rejections.inc({ clientId, dimensionCode: dimensionCode ?? 'UNKNOWN', windowType: windowType ?? 'UNKNOWN', metric });
    }
  }

  recordInProgress(clientId) {
    this.inProgress.inc({ clientId });
  }

  recordError(clientId, code) {
    this.errors.inc({ clientId, code });
  }

  recordFloorGuardFailure(clientId, tier, source) {
    this.floorGuardFailures.inc({ clientId, tier, source });
  }

  recordDrift(clientId, action) {
    this.counterDrift.inc({ clientId, action });
  }

  observeTierLatency(tier, seconds) {
    this.tierLatency.observe({ tier }, seconds);
  }

  observeRequestLatency(seconds) {
    this.requestLatency.observe(seconds);
  }

  setReplicationLag(seconds) {
    this.replicationLagSeconds.set(seconds);
  }

  /** BRD §4.11 AC3 — one call gives a caller both retry hooks for a given tier, so instrumenting a `withTransientRetry` call site is a one-line addition. */
  retryHooksFor(tier) {
    return {
      onTransient: () => this.recordRetry(tier),
      onExhausted: () => this.recordRetryExhausted(tier),
    };
  }

  recordRetry(tier) {
    this.retryAttempts.inc({ tier });
  }

  recordRetryExhausted(tier) {
    this.retryExhausted.inc({ tier });
  }

  async exposition() {
    return this.registry.metrics();
  }

  contentType() {
    return this.registry.contentType;
  }
}
