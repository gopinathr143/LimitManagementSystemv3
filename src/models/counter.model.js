import { AppError } from '../utils/AppError.js';
import { bucketLabelFor, expireAtFor } from '../utils/windowBoundary.js';
import { WINDOW_TYPE } from '../constants/index.js';

export const COUNTERS_COLLECTION = 'counters';

const KEY_PREFIX = 'limit';
const RESERVED_CHARS = /[:|#]/;

function assertSafeSegment(value, label) {
  if (typeof value !== 'string' || value === '') {
    throw AppError.badRequest(`${label} must be a non-empty string.`, 'INVALID_COUNTER_KEY_SEGMENT');
  }
  if (RESERVED_CHARS.test(value)) {
    throw AppError.badRequest(`${label} '${value}' contains a reserved counter-key character (: | #).`, 'INVALID_COUNTER_KEY_SEGMENT');
  }
}

/**
 * BRD §4.2 — `limit:{clientId}:{dimensionCode}:{windowType}:{attrValue1}|{attrValue2}|...:{windowBucket}`.
 * The attribute segment is omitted entirely (not left empty) for a
 * zero-attribute dimension like GLOBAL — matches the BRD's own examples:
 * `limit:CLIENT_A:UCIC:DAILY_CALENDAR:U12345:2026-08-10` vs
 * `limit:CLIENT_A:GLOBAL:DAILY_CALENDAR:2026-08-10#7`.
 */
function buildBaseSegments({ clientId, dimensionCode, windowType, attributeValues }) {
  assertSafeSegment(clientId, 'clientId');
  assertSafeSegment(dimensionCode, 'dimensionCode');
  assertSafeSegment(windowType, 'windowType');

  const segments = [KEY_PREFIX, clientId, dimensionCode, windowType];
  if (attributeValues.length > 0) {
    attributeValues.forEach((value, i) => assertSafeSegment(String(value), `attributeValues[${i}]`));
    segments.push(attributeValues.map(String).join('|'));
  }
  return segments;
}

/** STORY-03-01 — deterministic key for a calendar-day or monthly bucketed counter (Tier 0/1/2, non-rolling). */
export function buildCounterKey({ clientId, dimensionCode, windowType, attributeValues = [], windowBucket, shardIndex }) {
  if (windowType === WINDOW_TYPE.DAILY_ROLLING) {
    throw new Error('buildCounterKey does not handle DAILY_ROLLING — use buildRollingKey.');
  }
  assertSafeSegment(windowBucket, 'windowBucket');
  const segments = buildBaseSegments({ clientId, dimensionCode, windowType, attributeValues });
  segments.push(windowBucket);
  const key = segments.join(':');
  return shardIndex === undefined ? key : `${key}#${shardIndex}`;
}

/** BRD §4.2.5 — the rolling window is a single per-entity document, not bucketed by calendar window, so there is no windowBucket segment. */
export function buildRollingKey({ clientId, dimensionCode, attributeValues = [], shardIndex }) {
  const segments = buildBaseSegments({ clientId, dimensionCode, windowType: WINDOW_TYPE.DAILY_ROLLING, attributeValues });
  const key = segments.join(':');
  return shardIndex === undefined ? key : `${key}#${shardIndex}`;
}

/** Convenience: resolves the current window bucket label and expireAt for a DAILY_CALENDAR/MONTHLY counter, in the client's timezone. */
export function resolveWindowBucket(windowType, timezone, now = new Date()) {
  return { windowBucket: bucketLabelFor(windowType, timezone, now), expireAt: expireAtFor(windowType, timezone, now) };
}

/** STORY-03-01 AC4/AC5 — clientId is a queryable field (in addition to being embedded in `_id`); amounts are integers (paise), never floats. */
export function buildBootstrapDocument({ clientId, now, expireAt }) {
  return { clientId, amount: 0, count: 0, createdAt: now, updatedAt: now, expireAt };
}
