import { Router } from 'express';
import { requireOwnClientParam } from '../middleware/tenantAuth.middleware.js';

export const createLimitDefinitionRouter = (tenantAuth, limitDefinitionController) => {
  const router = Router({ mergeParams: true });

  router.use(tenantAuth, requireOwnClientParam);

  router.post('/', limitDefinitionController.create);
  router.get('/', limitDefinitionController.list);
  router.get('/:id', limitDefinitionController.get);
  router.put('/:id', limitDefinitionController.update);
  router.patch('/:id', limitDefinitionController.update);
  router.delete('/:id', limitDefinitionController.deactivate);

  return router;
};
