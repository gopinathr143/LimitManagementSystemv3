import './helpers/testEnv.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTenantAuth, requireOwnClientParam } from '../../src/middleware/tenantAuth.middleware.js';
import { mockReq, mockNext } from './helpers/testEnv.js';
import { AppError } from '../../src/utils/AppError.js';
import { hashApiKey, fingerprintOf } from '../../src/utils/crypto.js';

function fakeClientServiceFor(client) {
  return {
    async resolveByApiKey(apiKey) {
      const hash = hashApiKey(apiKey);
      const fingerprint = fingerprintOf(hash);
      if (!client || hashApiKey(client.__apiKey) !== hash) {
        return { client: null, fingerprint };
      }
      return { client, fingerprint };
    },
  };
}

describe('tenantAuth — STORY-01-02 clientId derivation', () => {
  test('AC3: no credential -> rejected, unauthenticated, no clientId resolved', async () => {
    const req = mockReq();
    const next = mockNext();
    await createTenantAuth(fakeClientServiceFor(null))(req, {}, next);
    assert.ok(next.calls[0] instanceof AppError);
    assert.equal(next.calls[0].statusCode, 401);
    assert.equal(req.tenant, undefined);
  });

  test('AC3: unrecognised credential -> rejected, unauthenticated', async () => {
    const req = mockReq({ headers: { 'x-api-key': 'garbage' } });
    const next = mockNext();
    await createTenantAuth(fakeClientServiceFor(null))(req, {}, next);
    assert.equal(next.calls[0].statusCode, 401);
  });

  test('STORY-01-04 AC2: SUSPENDED client fails closed before any counter access', async () => {
    const client = { __apiKey: 'key-1', clientId: 'CLIENT_A', status: 'SUSPENDED', timezone: 'UTC' };
    const req = mockReq({ headers: { 'x-api-key': 'key-1' } });
    const next = mockNext();
    await createTenantAuth(fakeClientServiceFor(client))(req, {}, next);
    assert.equal(next.calls[0].statusCode, 403);
    assert.equal(req.tenant, undefined);
  });

  test('AC2: payload clientId mismatching the authenticated principal is rejected', async () => {
    const client = { __apiKey: 'key-1', clientId: 'CLIENT_A', status: 'ACTIVE', timezone: 'UTC' };
    const req = mockReq({ headers: { 'x-api-key': 'key-1' }, body: { clientId: 'CLIENT_B' } });
    const next = mockNext();
    await createTenantAuth(fakeClientServiceFor(client))(req, {}, next);
    assert.equal(next.calls[0].statusCode, 403);
    assert.equal(next.calls[0].code, 'CLIENT_ID_MISMATCH');
  });

  test('AC1: a valid principal resolves clientId and proceeds', async () => {
    const client = { __apiKey: 'key-1', clientId: 'CLIENT_A', status: 'ACTIVE', timezone: 'Asia/Kolkata' };
    const req = mockReq({ headers: { 'x-api-key': 'key-1' } });
    const next = mockNext();
    await createTenantAuth(fakeClientServiceFor(client))(req, {}, next);
    assert.equal(next.calls[0], undefined);
    assert.equal(req.tenant.clientId, 'CLIENT_A');
  });
});

describe('requireOwnClientParam — STORY-01-03 AC2', () => {
  test('rejects a path naming another client', () => {
    const req = mockReq({ params: { clientId: 'CLIENT_B' } });
    req.tenant = { clientId: 'CLIENT_A' };
    const next = mockNext();
    requireOwnClientParam(req, {}, next);
    assert.equal(next.calls[0].statusCode, 403);
    assert.equal(next.calls[0].code, 'CROSS_TENANT_ACCESS_DENIED');
  });

  test('allows a path naming the caller\'s own clientId', () => {
    const req = mockReq({ params: { clientId: 'CLIENT_A' } });
    req.tenant = { clientId: 'CLIENT_A' };
    const next = mockNext();
    requireOwnClientParam(req, {}, next);
    assert.equal(next.calls[0], undefined);
  });
});
