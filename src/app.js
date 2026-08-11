import express from 'express';
import { registerGlobalMiddleware } from './middleware/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createResolveClientId } from './middleware/resolveClientId.middleware.js';
import { createApiRouter } from './routes/index.js';

import { ClientRepository } from './repositories/client.repository.js';
import { ConfigAuditRepository } from './repositories/configAudit.repository.js';
import { RegistryRepository } from './repositories/registry.repository.js';
import { LimitDefinitionRepository } from './repositories/limitDefinition.repository.js';
import { LimitsAuditRepository } from './repositories/limitsAudit.repository.js';

import { ClientService } from './services/client.service.js';
import { RegistryService } from './services/registry.service.js';
import { LimitDefinitionService } from './services/limitDefinition.service.js';
import { ConfigCache } from './services/configCache.service.js';

import { ClientController } from './controllers/client.controller.js';
import { RegistryController } from './controllers/registry.controller.js';
import { LimitDefinitionController } from './controllers/limitDefinition.controller.js';

import { CLIENTS_COLLECTION } from './models/client.model.js';
import { CONFIG_AUDIT_COLLECTION } from './models/configAudit.model.js';
import { CLIENT_CONFIGS_COLLECTION } from './models/registry.model.js';
import { LIMITS_COLLECTION } from './models/limitDefinition.model.js';
import { LIMITS_AUDIT_COLLECTION } from './models/limitsAudit.model.js';

/**
 * Composition root. Takes a connected `db` handle and wires
 * repository -> service -> controller -> route for every feature, so tests
 * can build a full app against a test database with no HTTP listener.
 */
export function createApp(db) {
  const clientRepository = new ClientRepository(db.collection(CLIENTS_COLLECTION));
  const configAuditRepository = new ConfigAuditRepository(db.collection(CONFIG_AUDIT_COLLECTION));
  const registryRepository = new RegistryRepository(db.collection(CLIENT_CONFIGS_COLLECTION));
  const limitDefinitionRepository = new LimitDefinitionRepository(db.collection(LIMITS_COLLECTION));
  const limitsAuditRepository = new LimitsAuditRepository(db.collection(LIMITS_AUDIT_COLLECTION));

  const clientService = new ClientService(clientRepository, configAuditRepository);
  const configCache = new ConfigCache(registryRepository, limitDefinitionRepository);
  const registryService = new RegistryService(registryRepository, limitsAuditRepository, clientService, configCache);
  const limitDefinitionService = new LimitDefinitionService(
    limitDefinitionRepository,
    limitsAuditRepository,
    registryRepository,
    registryService,
    configCache,
  );

  const clientController = new ClientController(clientService);
  const registryController = new RegistryController(registryService);
  const limitDefinitionController = new LimitDefinitionController(limitDefinitionService);

  const resolveClientId = createResolveClientId(clientService);

  const app = express();
  registerGlobalMiddleware(app);

  app.use('/', createApiRouter({ resolveClientId, clientController, registryController, limitDefinitionController }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  // Exposed for other epics' route wiring and for tests that need service/cache instances directly.
  app.locals.services = { clientService, registryService, limitDefinitionService };
  app.locals.configCache = configCache;
  app.locals.warmConfigCache = async () => {
    const activeClientIds = await clientRepository.listActiveClientIds();
    await configCache.warm(activeClientIds);
    return activeClientIds;
  };

  return app;
}
