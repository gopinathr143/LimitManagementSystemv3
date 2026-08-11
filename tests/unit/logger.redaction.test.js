import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACT_PATHS } from '../../src/config/logger.js';

function captureLogger() {
  let output = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      output += chunk.toString();
      cb();
    },
  });
  // Same redact config as the real logger — a captured stream in place of stdout, since pino
  // writes synchronously to whatever destination it's given.
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream);
  return { logger, getLines: () => output.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) };
}

describe('Logger redaction — BRD §4.10 AC2', () => {
  test('a top-level ucic or accountNumber field is censored, never logged in full', () => {
    const { logger, getLines } = captureLogger();
    logger.info({ ucic: 'U12345', accountNumber: 'ACC98765' }, 'top level');
    const [line] = getLines();
    assert.equal(line.ucic, '[REDACTED]');
    assert.equal(line.accountNumber, '[REDACTED]');
  });

  test('ucic/accountNumber nested one or two levels deep are also censored', () => {
    const { logger, getLines } = captureLogger();
    logger.info({ requestData: { ucic: 'U1', accountNumber: 'A1' }, rejection: { detail: { accountNumber: 'A2' } } }, 'nested');
    const [line] = getLines();
    assert.equal(line.requestData.ucic, '[REDACTED]');
    assert.equal(line.requestData.accountNumber, '[REDACTED]');
    assert.equal(line.rejection.detail.accountNumber, '[REDACTED]');
  });

  test('every other field on the same log line is left untouched — redaction is targeted, not blanket', () => {
    const { logger, getLines } = captureLogger();
    logger.info({ clientId: 'CLIENT_A', transactionId: 'T1', ucic: 'U1' }, 'mixed');
    const [line] = getLines();
    assert.equal(line.clientId, 'CLIENT_A');
    assert.equal(line.transactionId, 'T1');
    assert.equal(line.ucic, '[REDACTED]');
  });

  test('known depth limit: redaction is a finite explicit path list, not a recursive wildcard — three or more levels deep is NOT covered', () => {
    const { logger, getLines } = captureLogger();
    logger.info({ a: { b: { c: { ucic: 'TOO_DEEP' } } } }, 'too deep');
    const [line] = getLines();
    // This assertion documents the known, accepted limitation (see REDACT_PATHS' comment in
    // src/config/logger.js) rather than a desired behavior — it exists so a future change to the
    // redaction depth is a deliberate, reviewed edit to this test, not a silent regression either way.
    assert.equal(line.a.b.c.ucic, 'TOO_DEEP');
  });
});
