/**
 * STORY-02-01 DoD — "Snapshot objects are immutable after load, enforced by
 * type or test." Recurses through plain objects/arrays; leaves Date and
 * other non-plain values alone (freezing a Date doesn't stop it being
 * mutated via its own methods, but nothing in this codebase does that).
 */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  // TypedArrays/Buffers/DataViews with elements cannot be frozen (V8 throws:
  // "Cannot freeze array buffer views with elements") — MongoDB's ObjectId
  // carries one internally (its `id` byte buffer). Treated as an opaque leaf
  // rather than walked into; the driver never hands back a live/shared
  // buffer here for us to worry about mutation of.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}
