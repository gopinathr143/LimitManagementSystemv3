import { Router } from 'express';

/** clientId is taken from the path (no authentication — see resolveClientId.middleware.js). */
export const createTransactionRouter = (resolveClientId, transactionController) => {
  const router = Router({ mergeParams: true });

  router.use(resolveClientId);

  router.post('/', transactionController.submit);
  router.get('/:transactionId', transactionController.getByTransactionId);

  return router;
};
