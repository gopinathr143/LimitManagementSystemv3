import { Router } from 'express';
import { requireOwnClientParam } from '../middleware/tenantAuth.middleware.js';

/** BRD §4.4 — `clientId` is taken from the authenticated principal (tenant auth), not admin; the path carries it for clarity and routing. */
export const createRegistryRouter = (tenantAuth, registryController) => {
  const router = Router({ mergeParams: true });

  router.use(tenantAuth, requireOwnClientParam);

  router.get('/', registryController.get);
  router.put('/', registryController.replace);

  return router;
};
