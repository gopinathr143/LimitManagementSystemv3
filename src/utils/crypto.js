import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const API_KEY_BYTES = 32;
const FINGERPRINT_LENGTH = 12;

/** Opaque bearer credential handed to a client once at creation/rotation time. Never persisted in plaintext. */
export function generateApiKey() {
  return randomBytes(API_KEY_BYTES).toString('base64url');
}

export function hashApiKey(apiKey) {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

/** Safe-to-log identifier for a credential (BRD §4.10 log hygiene: fingerprint, never the secret). */
export function fingerprintOf(apiKeyHash) {
  return apiKeyHash.slice(0, FINGERPRINT_LENGTH);
}

export function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    // still run a comparison of equal-length buffers so failure timing
    // doesn't leak length information via early return
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
