import { logger } from '../config/logger.js';

const DEFAULT_TOLERANCE_MS = 10_000; // BRD §4.11 AC5 names no specific number ("exceeds tolerance"); a conservative default, tunable per environment.
const DEFAULT_POLL_INTERVAL_MS = 30_000;

/**
 * BRD §4.11 AC5 — "replication lag on the primary path... exceeds
 * tolerance... an alert fires, because a stale counter read causes
 * over-approval." Same shape as `ClockSkewMonitor` (STORY-04-06): `check()`
 * is pure policy over an already-obtained `replSetGetStatus`-shaped
 * reading, so it's unit-testable with fake multi-member status objects this
 * codebase's real local topology (a single-node replica set) can't
 * exercise; `poll()` is the one place that actually calls the driver.
 *
 * BRD §4.6 already restricts the enforcement path itself to `readPreference:
 * PRIMARY` (STORY-03-07) — a lagging secondary can never be read from for a
 * counter decision regardless of what this monitor reports. What this adds
 * is the operational visibility BRD §4.11 asks for: an early warning that
 * replication itself is unhealthy, which a primary step-down would turn
 * into real, reconciliation-repairable increment loss (BRD §4.9).
 */
export class ReplicationLagMonitor {
  constructor({ toleranceMs = DEFAULT_TOLERANCE_MS, metricsService } = {}) {
    this.toleranceMs = toleranceMs;
    this.metricsService = metricsService ?? null;
    this.lastLagMs = 0;
    this.healthy = true;
    this.timer = null;
  }

  /** `status` is the object `db.admin().command({ replSetGetStatus: 1 })` resolves to. */
  check(status) {
    const members = status?.members ?? [];
    const primary = members.find((m) => m.stateStr === 'PRIMARY');
    const secondaries = members.filter((m) => m.stateStr === 'SECONDARY');

    if (!primary || secondaries.length === 0) {
      // A single-node replica set (this codebase's local/dev topology) or a primary-less state — nothing to measure yet.
      this.lastLagMs = 0;
      this.healthy = true;
      this.metricsService?.setReplicationLag(0);
      return { withinTolerance: true, lagMs: 0, measured: false };
    }

    const primaryOptimeMs = primary.optimeDate.getTime();
    const lagMs = Math.max(...secondaries.map((secondary) => primaryOptimeMs - secondary.optimeDate.getTime()));
    this.lastLagMs = lagMs;
    this.healthy = lagMs <= this.toleranceMs;
    this.metricsService?.setReplicationLag(lagMs / 1000);

    if (!this.healthy) {
      logger.error({ lagMs, toleranceMs: this.toleranceMs }, 'Replication lag exceeds tolerance — a stale counter read risks over-approval (BRD §4.11 AC5)');
    }
    return { withinTolerance: this.healthy, lagMs, measured: true };
  }

  isHealthy() {
    return this.healthy;
  }

  /** The actual DB call site — kept separate from `check()` so policy stays unit-testable without a real multi-member replica set. */
  async poll(adminDb) {
    const status = await adminDb.command({ replSetGetStatus: 1 });
    return this.check(status);
  }

  start(adminDb, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.poll(adminDb).catch((error) => logger.error({ err: error }, 'Replication lag poll failed'));
    }, intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
