import pino from 'pino';
import { env } from './env.js';

/**
 * BRD §4.10 "Log hygiene": account numbers and UCIC must never appear in
 * application logs in full. Fields below are redacted defensively at the
 * logger level so a call site forgetting to mask something is still safe.
 */
const REDACT_PATHS = [
  'req.headers["x-api-key"]',
  'req.headers["x-admin-api-key"]',
  'apiKey',
  '*.apiKey',
  'apiKeyHash',
  '*.apiKeyHash',
  'ucic',
  '*.ucic',
  'accountNumber',
  '*.accountNumber',
];

export const logger = pino({
  level: env.logLevel,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'imps-outward-velocity-limit-system' },
});
