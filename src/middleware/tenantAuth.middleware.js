import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';
import { isActive } from '../services/client.service.js';
import { PRINCIPAL_ROLE } from '../constants/index.js';

/**
 * STORY-01-02 / STORY-01-04 — the load-bearing tenant trust boundary.
 * clientId is *derived* from the authenticated credential; it is never
 * accepted on trust from a request field. Every check here runs before any
 * validation, counter access or audit mutation (BRD §2.1.1, §4.9 fail-closed).
 *
 * Factory so route wiring injects the ClientService instance rather than
 * this module reaching into a singleton.
 */
export function createTenantAuth(clientService) {
  return async function tenantAuth(req, res, next) {
    try {
      const apiKey = req.header(env.auth.apiKeyHeader);

      if (!apiKey) {
        logger.warn({ path: req.originalUrl }, 'Tenant auth rejected: no credential presented');
        return next(AppError.unauthorized('API key required.', 'TENANT_AUTH_REQUIRED'));
      }

      const { client, fingerprint } = await clientService.resolveByApiKey(apiKey);

      if (!client) {
        logger.warn({ fingerprint, path: req.originalUrl }, 'Tenant auth rejected: unrecognised or rotated credential');
        return next(AppError.unauthorized('Invalid API key.', 'TENANT_AUTH_INVALID'));
      }

      // Fail closed before any validation or counter access — unknown/inactive/suspended clients never proceed.
      if (!isActive(client)) {
        logger.warn({ clientId: client.clientId, fingerprint, status: client.status }, 'Tenant auth rejected: client not ACTIVE');
        return next(AppError.forbidden('Client is not active.', 'CLIENT_NOT_ACTIVE'));
      }

      const payloadClientId = req.body?.clientId;
      if (payloadClientId !== undefined && payloadClientId !== client.clientId) {
        logger.warn(
          { authenticatedClientId: client.clientId, payloadClientId, fingerprint },
          'Tenant auth rejected: payload clientId does not match authenticated principal',
        );
        return next(AppError.forbidden('Payload clientId does not match the authenticated principal.', 'CLIENT_ID_MISMATCH'));
      }

      req.principal = { role: PRINCIPAL_ROLE.TENANT, fingerprint };
      req.tenant = { clientId: client.clientId, timezone: client.timezone };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * For any route shaped .../:clientId/... — rejects a request naming another
 * tenant's clientId in the path, with no data returned and no mutation
 * (STORY-01-03 AC2). Mount after createTenantAuth() on such routes.
 */
export function requireOwnClientParam(req, res, next) {
  const pathClientId = req.params.clientId;
  if (pathClientId !== undefined && pathClientId !== req.tenant?.clientId) {
    logger.warn(
      { authenticatedClientId: req.tenant?.clientId, pathClientId },
      'Tenant auth rejected: path clientId does not match authenticated principal',
    );
    return next(AppError.forbidden('Cannot access another client\'s resources.', 'CROSS_TENANT_ACCESS_DENIED'));
  }
  return next();
}
