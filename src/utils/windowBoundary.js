import { DateTime } from 'luxon';
import { WINDOW_TYPE } from '../constants/index.js';

/**
 * BRD §4.8 — window boundaries compute in the client's configured IANA
 * timezone, not the server's. Hand-rolling "next midnight in timezone X" is
 * a well-known correctness trap around DST transitions; luxon carries that
 * complexity so it isn't reinvented (and mis-derived) here.
 */
export function nextDailyBoundary(timezone, from = new Date()) {
  return DateTime.fromJSDate(from, { zone: timezone }).plus({ days: 1 }).startOf('day').toJSDate();
}

export function nextMonthlyBoundary(timezone, from = new Date()) {
  return DateTime.fromJSDate(from, { zone: timezone }).plus({ months: 1 }).startOf('month').toJSDate();
}

/** BRD §4.3.2 — "next window boundary for that window type". DAILY_ROLLING activates at the next midnight, same as DAILY_CALENDAR (both are daily-cycle windows). */
export function nextBoundaryFor(windowType, timezone, from = new Date()) {
  if (windowType === WINDOW_TYPE.MONTHLY) {
    return nextMonthlyBoundary(timezone, from);
  }
  return nextDailyBoundary(timezone, from);
}

/** BRD §4.2 — the calendar-day window bucket label, e.g. "2026-08-10", in the client's timezone. */
export function dailyCalendarBucketLabel(timezone, from = new Date()) {
  return DateTime.fromJSDate(from, { zone: timezone }).toFormat('yyyy-MM-dd');
}

/** BRD §4.2 — the monthly window bucket label, e.g. "2026-08", in the client's timezone. */
export function monthlyBucketLabel(timezone, from = new Date()) {
  return DateTime.fromJSDate(from, { zone: timezone }).toFormat('yyyy-MM');
}

export function bucketLabelFor(windowType, timezone, from = new Date()) {
  return windowType === WINDOW_TYPE.MONTHLY ? monthlyBucketLabel(timezone, from) : dailyCalendarBucketLabel(timezone, from);
}

/**
 * BRD §4.2 example (`expireAt: "2026-08-11T00:05:00Z"` for a day ending
 * `2026-08-10`) — a short grace period after the boundary so a request
 * that lands exactly at the edge still resolves against a live document
 * rather than racing the TTL reaper.
 */
const TTL_GRACE_MS = 5 * 60 * 1000;

export function expireAtFor(windowType, timezone, from = new Date()) {
  return new Date(nextBoundaryFor(windowType, timezone, from).getTime() + TTL_GRACE_MS);
}

/**
 * BRD §4.2.5 — the rolling window is a pure 24h sliding horizon, not tied
 * to any calendar boundary or client timezone (unlike DAILY_CALENDAR/
 * MONTHLY). Bucket labels are computed in UTC so they are directly,
 * lexicographically comparable regardless of where the request came from.
 */
export function rollingBucketLabel(from = new Date(), granularity = 'HOUR') {
  const dt = DateTime.fromJSDate(from, { zone: 'utc' });
  return granularity === 'MINUTE' ? dt.toFormat('yyyy-MM-dd-HH-mm') : dt.toFormat('yyyy-MM-dd-HH');
}

/** The oldest bucket label still inside the 24h horizon as of `from` — anything older is pruned. */
export function rollingHorizonLabel(from = new Date(), granularity = 'HOUR') {
  const horizon = DateTime.fromJSDate(from, { zone: 'utc' }).minus({ hours: 24 });
  return granularity === 'MINUTE' ? horizon.toFormat('yyyy-MM-dd-HH-mm') : horizon.toFormat('yyyy-MM-dd-HH');
}

/** Self-maintaining TTL safety net for a dormant entity's rolling document — refreshed forward on every transaction, so an active entity's document never expires. */
export function rollingExpireAtFor(from = new Date()) {
  return new Date(from.getTime() + 25 * 60 * 60 * 1000);
}
