import { Router } from 'express';
import { createClientRouter } from './client.routes.js';
import { createRegistryRouter } from './registry.routes.js';
import { createLimitDefinitionRouter } from './limitDefinition.routes.js';

export const createApiRouter = ({ tenantAuth, clientController, registryController, limitDefinitionController }) => {
  const router = Router();

  router.get('/health', (req, res) => res.status(200).json({ success: true, data: { status: 'UP' } }));

  // Tenant-scoped routes (BRD §4.4) are mounted BEFORE the general /clients
  // admin router. Express tries mounted routers in registration order by
  // path prefix, and the admin router's blanket adminAuth applies to
  // *every* sub-path under /clients — mounting these more-specific paths
  // first is what keeps that adminAuth from intercepting tenant traffic
  // before tenantAuth ever runs.
  router.use('/clients/:clientId/dimensions', createRegistryRouter(tenantAuth, registryController));
  router.use('/clients/:clientId/limits', createLimitDefinitionRouter(tenantAuth, limitDefinitionController));

  // Admin-only (STORY-01-01): onboard/list/read/patch clients.
  router.use('/clients', createClientRouter(clientController));

  return router;
};
