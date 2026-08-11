import { Router } from 'express';
import { createClientRouter } from './client.routes.js';
import { createRegistryRouter } from './registry.routes.js';
import { createLimitDefinitionRouter } from './limitDefinition.routes.js';

export const createApiRouter = ({ resolveClientId, clientController, registryController, limitDefinitionController }) => {
  const router = Router();

  router.get('/health', (req, res) => res.status(200).json({ success: true, data: { status: 'UP' } }));

  // Mounted before the general /clients router so Express matches these
  // more-specific paths first (no auth-ordering concern anymore — this is
  // purely about correct route matching).
  router.use('/clients/:clientId/dimensions', createRegistryRouter(resolveClientId, registryController));
  router.use('/clients/:clientId/limits', createLimitDefinitionRouter(resolveClientId, limitDefinitionController));

  router.use('/clients', createClientRouter(clientController));

  return router;
};
