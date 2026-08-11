import { Router } from 'express';

/** clientId is taken from the path (no authentication — see resolveClientId.middleware.js). */
export const createLimitDefinitionRouter = (resolveClientId, limitDefinitionController) => {
  const router = Router({ mergeParams: true });

  router.use(resolveClientId);

  router.post('/', limitDefinitionController.create);
  router.get('/', limitDefinitionController.list);
  router.get('/:id', limitDefinitionController.get);
  router.put('/:id', limitDefinitionController.update);
  router.patch('/:id', limitDefinitionController.update);
  router.delete('/:id', limitDefinitionController.deactivate);

  return router;
};
