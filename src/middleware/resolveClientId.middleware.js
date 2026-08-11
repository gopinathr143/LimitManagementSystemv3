import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';
import { isActive } from '../services/client.service.js';

/**
 * No authentication on this API — callers are trusted same-cluster
 * consumers (deliberate decision, not an oversight). `clientId` is taken
 * directly from the path rather than derived from a credential.
 *
 * What still holds from BRD §2.1.1 / §4.9's fail-closed posture: an
 * unknown or non-ACTIVE clientId is rejected before any further
 * processing. What's dropped is the "derived from an authenticated
 * principal" clause — there is no principal. If this API is ever exposed
 * beyond the cluster, the plan is OAuth with scopes; this middleware is
 * the single place that swap would happen (see STORY-01-02 notes).
 *
 * Factory so route wiring injects the ClientService instance rather than
 * this module reaching into a singleton.
 */
export function createResolveClientId(clientService) {
  return async function resolveClientId(req, res, next) {
    try {
      const clientId = req.params.clientId;
      if (!clientId) {
        return next(AppError.badRequest('clientId is required.', 'CLIENT_ID_REQUIRED'));
      }

      const client = await clientService.getClient(clientId);

      if (!isActive(client)) {
        logger.warn({ clientId, status: client.status }, 'Request rejected: client not ACTIVE');
        return next(AppError.forbidden('Client is not active.', 'CLIENT_NOT_ACTIVE'));
      }

      req.tenant = { clientId: client.clientId, timezone: client.timezone };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
