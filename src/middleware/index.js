import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger.js';

/** Global middleware register window — extend here, not ad hoc in app.js. */
export const registerGlobalMiddleware = (app) => {
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers['x-request-id'] ?? randomUUID(),
    }),
  );
};
