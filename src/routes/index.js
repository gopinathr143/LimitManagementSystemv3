import { Router } from 'express';
import { createClientRouter } from './client.routes.js';
import { createRegistryRouter } from './registry.routes.js';
import { createLimitDefinitionRouter } from './limitDefinition.routes.js';
import { createTransactionRouter } from './transaction.routes.js';

export const createApiRouter = ({ resolveClientId, clientController, registryController, limitDefinitionController, transactionController, metricsService }) => {
  const router = Router();

  router.get('/health', (req, res) => res.status(200).json({ success: true, data: { status: 'UP' } }));

  // BRD §4.11 — scrape endpoint for the metric catalogue in src/services/metrics.service.js.
  // Unauthenticated like every other route today (see resolveClientId.middleware.js) — in a
  // real deployment this should be network-restricted to the scraper, not exposed publicly.
  router.get('/metrics', async (req, res, next) => {
    try {
      res.set('Content-Type', metricsService.contentType());
      res.send(await metricsService.exposition());
    } catch (error) {
      next(error);
    }
  });

  // Mounted before the general /clients router so Express matches these
  // more-specific paths first (no auth-ordering concern anymore — this is
  // purely about correct route matching).
  router.use('/clients/:clientId/dimensions', createRegistryRouter(resolveClientId, registryController));
  router.use('/clients/:clientId/limits', createLimitDefinitionRouter(resolveClientId, limitDefinitionController));
  router.use('/clients/:clientId/transactions', createTransactionRouter(resolveClientId, transactionController));

  router.use('/clients', createClientRouter(clientController));

  return router;
};
