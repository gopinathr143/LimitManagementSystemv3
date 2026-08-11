import { logger } from '../config/logger.js';

const DEFAULT_TOLERANCE_MS = 1000; // BRD §4.8 — skew held under ±1 second.

/**
 * BRD §4.8 — "All instances MUST run NTP with skew held under ±1 second;
 * skew beyond a configured tolerance raises an alert and the instance is
 * drained." Actually *measuring* skew against a trusted time source is an
 * OS/infrastructure concern (an NTP daemon — chronyd/ntpd — reports drift
 * as an operating-system metric); implementing an NTP client inside this
 * service would mean parsing untrusted third-party protocol responses for
 * a control this system doesn't own the enforcement of. What belongs at
 * the application layer, and is implemented here, is the *policy*: given
 * a measured skew (however obtained — an NTP daemon's exported metric, a
 * trusted upstream timestamp, a health-check probe), decide whether it's
 * within tolerance and raise the alert BRD §4.8 requires.
 */
export class ClockSkewMonitor {
  constructor({ toleranceMs = DEFAULT_TOLERANCE_MS } = {}) {
    this.toleranceMs = toleranceMs;
    this.lastSkewMs = 0;
    this.healthy = true;
  }

  /** `referenceTime` is a trusted external clock reading (an NTP daemon's metric, an upstream timestamp, ...). */
  check(referenceTime, localNow = new Date()) {
    const skewMs = Math.abs(localNow.getTime() - referenceTime.getTime());
    this.lastSkewMs = skewMs;
    this.healthy = skewMs <= this.toleranceMs;

    if (!this.healthy) {
      logger.error({ skewMs, toleranceMs: this.toleranceMs }, 'Clock skew exceeds tolerance — instance should be drained (BRD §4.8)');
    }
    return { withinTolerance: this.healthy, skewMs };
  }

  isHealthy() {
    return this.healthy;
  }
}
