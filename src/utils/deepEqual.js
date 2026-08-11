/**
 * Used to match a limit definition's `scope` (a flat map of attribute
 * name -> value, e.g. `{ ucic: 'U12345' }`) against a transaction's
 * resolved attribute values. Deliberately shallow-plain-object semantics
 * only — scope is never nested — not a general-purpose deep-equal.
 */
export function scopeEquals(a, b) {
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}
