import express from 'express';
import { registerGlobalMiddleware } from './middleware/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createApiRouter } from './routes/index.js';
import { ClientRepository } from './repositories/client.repository.js';
import { ConfigAuditRepository } from './repositories/configAudit.repository.js';
import { ClientService } from './services/client.service.js';
import { ClientController } from './controllers/client.controller.js';
import { CLIENTS_COLLECTION } from './models/client.model.js';
import { CONFIG_AUDIT_COLLECTION } from './models/configAudit.model.js';

/**
 * Composition root. Takes a connected `db` handle and wires
 * repository -> service -> controller -> route for every feature, so tests
 * can build a full app against a test database with no HTTP listener.
 */
export function createApp(db) {
  const clientRepository = new ClientRepository(db.collection(CLIENTS_COLLECTION));
  const configAuditRepository = new ConfigAuditRepository(db.collection(CONFIG_AUDIT_COLLECTION));
  const clientService = new ClientService(clientRepository, configAuditRepository);
  const clientController = new ClientController(clientService);

  const app = express();
  registerGlobalMiddleware(app);

  app.use('/', createApiRouter({ clientController }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  // Exposed for other epics' route wiring and for tests that need service instances directly.
  app.locals.services = { clientService };

  return app;
}
