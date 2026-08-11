import { Router } from 'express';

/** clientId is taken from the path (no authentication — see resolveClientId.middleware.js). */
export const createRegistryRouter = (resolveClientId, registryController) => {
  const router = Router({ mergeParams: true });

  router.use(resolveClientId);

  router.get('/', registryController.get);
  router.put('/', registryController.replace);

  return router;
};
