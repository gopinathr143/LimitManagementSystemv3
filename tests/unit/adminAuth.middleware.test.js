import './helpers/testEnv.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth } from '../../src/middleware/adminAuth.middleware.js';
import { mockReq, mockNext } from './helpers/testEnv.js';
import { AppError } from '../../src/utils/AppError.js';
import { PRINCIPAL_ROLE } from '../../src/constants/index.js';

describe('adminAuth — STORY-01-01 AC3, admin/tenant credential separation', () => {
  test('rejects when no admin credential is presented', () => {
    const req = mockReq();
    const next = mockNext();
    adminAuth(req, {}, next);
    assert.ok(next.calls[0] instanceof AppError);
    assert.equal(next.calls[0].statusCode, 401);
  });

  test('rejects an unrecognised admin credential (e.g. a tenant API key)', () => {
    const req = mockReq({ headers: { 'x-admin-api-key': 'some-tenant-api-key' } });
    const next = mockNext();
    adminAuth(req, {}, next);
    assert.ok(next.calls[0] instanceof AppError);
    assert.equal(next.calls[0].statusCode, 401);
  });

  test('accepts a valid admin credential and sets req.principal', () => {
    const req = mockReq({ headers: { 'x-admin-api-key': 'test-admin-key-1' } });
    const next = mockNext();
    adminAuth(req, {}, next);
    assert.equal(next.calls[0], undefined);
    assert.equal(req.principal.role, PRINCIPAL_ROLE.ADMIN);
  });
});
