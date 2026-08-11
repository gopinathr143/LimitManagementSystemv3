/**
 * BRD §3.3 step 6 — "on transient errors — WriteConflict, network blips,
 * primary step-down — retry the failing single-document op 3× with
 * backoff 20ms / 40ms / 80ms. A limit breach is not a transient error and
 * is never retried." A breach is a normal *return value* (matchedCount:0),
 * never a thrown error, so it structurally never enters this retry path —
 * only a genuinely thrown transient error does.
 */
const TRANSIENT_ERROR_CODES = new Set([
  112, // WriteConflict
  189, // PrimarySteppedDown
  11600, // InterruptedAtShutdown
  11602, // InterruptedDueToReplStateChange
]);

const BACKOFF_MS = [20, 40, 80];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(error) {
  return TRANSIENT_ERROR_CODES.has(error?.code) || error?.hasErrorLabel?.('TransientTransactionError') === true;
}

export async function withTransientRetry(fn) {
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransient(error)) {
        throw error;
      }
      await sleep(BACKOFF_MS[attempt]);
    }
  }
  return fn();
}
