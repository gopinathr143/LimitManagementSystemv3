import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { timingSafeStringEqual, hashApiKey, fingerprintOf } from '../utils/crypto.js';
import { logger } from '../config/logger.js';
import { PRINCIPAL_ROLE } from '../constants/index.js';

/**
 * STORY-01-01 DoD: "Admin role is enforced by a separate credential from
 * tenant API credentials." Admin keys live only in server config
 * (ADMIN_API_KEYS), never in the `clients` collection, so a tenant
 * credential can never be escalated to admin.
 */
export function adminAuth(req, res, next) {
  const presented = req.header(env.auth.adminApiKeyHeader);

  if (!presented) {
    logger.warn({ path: req.originalUrl }, 'Admin auth rejected: no credential presented');
    return next(AppError.unauthorized('Admin credential required.', 'ADMIN_AUTH_REQUIRED'));
  }

  const matches = env.auth.adminApiKeys.some((candidate) => timingSafeStringEqual(presented, candidate));

  if (!matches) {
    logger.warn({ fingerprint: fingerprintOf(hashApiKey(presented)), path: req.originalUrl }, 'Admin auth rejected: unrecognised credential');
    return next(AppError.unauthorized('Invalid admin credential.', 'ADMIN_AUTH_INVALID'));
  }

  req.principal = { role: PRINCIPAL_ROLE.ADMIN, fingerprint: fingerprintOf(hashApiKey(presented)) };
  return next();
}
