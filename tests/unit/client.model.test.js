import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateClientCreatePayload } from '../../src/models/client.model.js';
import { AppError } from '../../src/utils/AppError.js';

describe('client.model validation — STORY-01-01 AC4', () => {
  test('accepts a valid payload', () => {
    assert.doesNotThrow(() =>
      validateClientCreatePayload({ clientId: 'CLIENT_A', name: 'Client A', timezone: 'Asia/Kolkata' }),
    );
  });

  test('rejects an invalid IANA timezone and names the offending field', () => {
    try {
      validateClientCreatePayload({ clientId: 'CLIENT_A', name: 'Client A', timezone: 'Not/A_Zone' });
      assert.fail('expected validation to throw');
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      const field = error.details.errors.find((e) => e.field === 'timezone');
      assert.ok(field, 'timezone error should be named');
    }
  });

  test('rejects a malformed clientId', () => {
    assert.throws(() => validateClientCreatePayload({ clientId: 'bad id!', name: 'X', timezone: 'UTC' }), AppError);
  });

  test('rejects a missing name', () => {
    assert.throws(() => validateClientCreatePayload({ clientId: 'CLIENT_A', timezone: 'UTC' }), AppError);
  });
});
