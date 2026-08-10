import express from 'express';
import { registerGlobalMiddleware } from '../../../src/middleware/index.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import { createTenantAuth, requireOwnClientParam } from '../../../src/middleware/tenantAuth.middleware.js';
import { ClientRepository } from '../../../src/repositories/client.repository.js';
import { ConfigAuditRepository } from '../../../src/repositories/configAudit.repository.js';
import { ClientService } from '../../../src/services/client.service.js';
import { CLIENTS_COLLECTION } from '../../../src/models/client.model.js';
import { CONFIG_AUDIT_COLLECTION } from '../../../src/models/configAudit.model.js';

/**
 * EPIC-01 has no tenant-facing business route yet (limits/transactions land
 * in later epics) — this mounts a minimal probe route using the exact
 * production tenantAuth + requireOwnClientParam middleware chain so
 * STORY-01-02/01-03/01-04 can be proven against a real client record in a
 * real replica set, ahead of those business routes existing.
 */
export function buildTenantTestApp(db) {
  const clientRepository = new ClientRepository(db.collection(CLIENTS_COLLECTION));
  const configAuditRepository = new ConfigAuditRepository(db.collection(CONFIG_AUDIT_COLLECTION));
  const clientService = new ClientService(clientRepository, configAuditRepository);
  const tenantAuth = createTenantAuth(clientService);

  const app = express();
  registerGlobalMiddleware(app);

  app.post('/probe', tenantAuth, (req, res) => {
    res.status(200).json({ success: true, data: { clientId: req.tenant.clientId } });
  });

  app.get('/clients/:clientId/probe', tenantAuth, requireOwnClientParam, (req, res) => {
    res.status(200).json({ success: true, data: { clientId: req.tenant.clientId } });
  });

  app.use(errorHandler);

  return { app, clientService };
}
