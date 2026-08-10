/** BRD §4.8 — window boundaries compute in the client's configured IANA timezone; reject anything else at config time. */
export function isValidIanaTimezone(timezone) {
  if (typeof timezone !== 'string' || timezone.trim() === '') {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
