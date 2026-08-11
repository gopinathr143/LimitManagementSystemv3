import './helpers/testEnv.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createResolveClientId } from '../../src/middleware/resolveClientId.middleware.js';
import { mockReq, mockNext } from './helpers/testEnv.js';
import { AppError } from '../../src/utils/AppError.js';

function fakeClientServiceFor(clients) {
  return {
    async getClient(clientId) {
      const client = clients.find((c) => c.clientId === clientId);
      if (!client) {
        throw AppError.notFound(`Client '${clientId}' not found.`, 'CLIENT_NOT_FOUND');
      }
      return client;
    },
  };
}

describe('resolveClientId — no authentication, clientId taken directly from the path', () => {
  test('rejects when the path carries no clientId at all', async () => {
    const req = mockReq({ params: {} });
    const next = mockNext();
    await createResolveClientId(fakeClientServiceFor([]))(req, {}, next);
    assert.ok(next.calls[0] instanceof AppError);
    assert.equal(next.calls[0].code, 'CLIENT_ID_REQUIRED');
  });

  test('fails closed on an unregistered clientId', async () => {
    const req = mockReq({ params: { clientId: 'DOES_NOT_EXIST' } });
    const next = mockNext();
    await createResolveClientId(fakeClientServiceFor([]))(req, {}, next);
    assert.equal(next.calls[0].code, 'CLIENT_NOT_FOUND');
    assert.equal(req.tenant, undefined);
  });

  test('fails closed on a SUSPENDED client', async () => {
    const clients = [{ clientId: 'CLIENT_A', status: 'SUSPENDED', timezone: 'UTC' }];
    const req = mockReq({ params: { clientId: 'CLIENT_A' } });
    const next = mockNext();
    await createResolveClientId(fakeClientServiceFor(clients))(req, {}, next);
    assert.equal(next.calls[0].code, 'CLIENT_NOT_ACTIVE');
    assert.equal(req.tenant, undefined);
  });

  test('an ACTIVE client resolves req.tenant and proceeds', async () => {
    const clients = [{ clientId: 'CLIENT_A', status: 'ACTIVE', timezone: 'Asia/Kolkata' }];
    const req = mockReq({ params: { clientId: 'CLIENT_A' } });
    const next = mockNext();
    await createResolveClientId(fakeClientServiceFor(clients))(req, {}, next);
    assert.equal(next.calls[0], undefined);
    assert.deepEqual(req.tenant, { clientId: 'CLIENT_A', timezone: 'Asia/Kolkata' });
  });
});
