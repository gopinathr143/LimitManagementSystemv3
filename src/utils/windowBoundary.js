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
