import { Router } from 'express';

/** No authentication (see resolveClientId.middleware.js notes) — /clients is open to same-cluster callers. */
export const createClientRouter = (clientController) => {
  const router = Router();

  router.post('/', clientController.create);
  router.get('/', clientController.list);
  router.get('/:clientId', clientController.getByClientId);
  router.patch('/:clientId', clientController.update);

  return router;
};
