import { Router } from 'express';
import { createClientRouter } from './client.routes.js';

export const createApiRouter = ({ clientController }) => {
  const router = Router();

  router.get('/health', (req, res) => res.status(200).json({ success: true, data: { status: 'UP' } }));
  router.use('/clients', createClientRouter(clientController));

  return router;
};
