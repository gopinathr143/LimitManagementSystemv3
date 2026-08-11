import pino from 'pino';
import { env } from './env.js';

/**
 * BRD §4.10 "Log hygiene": account numbers and UCIC must never appear in
 * application logs in full. Fields below are redacted defensively at the
 * logger level so a call site forgetting to mask something is still safe.
 */
const REDACT_PATHS = [
  // No API keys exist today (see resolveClientId.middleware.js), but
  // 'authorization' is kept ready for when OAuth is onboarded.
  'req.headers.authorization',
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
