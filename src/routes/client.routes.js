import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.middleware.js';

/**
 * BRD §4.4 — /clients is admin-only end to end (STORY-01-01 AC3: a
 * tenant-role caller gets rejected as unauthorised on any /clients route).
 */
export const createClientRouter = (clientController) => {
  const router = Router();

  router.use(adminAuth);

  router.post('/', clientController.create);
  router.get('/', clientController.list);
  router.get('/:clientId', clientController.getByClientId);
  router.patch('/:clientId', clientController.update);

  return router;
};
