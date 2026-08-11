import pino from 'pino';
import { env } from './env.js';

/**
 * BRD §4.10 "Log hygiene": account numbers and UCIC must never appear in
 * application logs in full. Fields below are redacted defensively at the
 * logger level so a call site forgetting to mask something is still safe.
 *
 * `fast-redact` (pino's redaction engine) wildcards are single-segment —
 * `*.ucic` matches exactly one level of nesting, not "any depth" — so this
 * is a finite, explicit list of depths rather than one recursive pattern.
 * Two levels covers every logger call in this codebase today (every call
 * site logs a small flat object — `{clientId, transactionId, ...}` — never
 * a full request payload; verified by code audit, STORY-06-04). A future
 * call site logging something nested deeper than this would need either an
 * added path here or, better, to stop logging the raw object at all.
 */
const REDACT_PATHS = [
  // No API keys exist today (see resolveClientId.middleware.js), but
  // 'authorization' is kept ready for when OAuth is onboarded.
  'req.headers.authorization',
  'ucic',
  '*.ucic',
  '*.*.ucic',
  'accountNumber',
  '*.accountNumber',
  '*.*.accountNumber',
];

export { REDACT_PATHS };

export const logger = pino({
  level: env.logLevel,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'imps-outward-velocity-limit-system' },
});
