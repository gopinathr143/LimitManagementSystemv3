import { AppError } from '../utils/AppError.js';
import { validateAndNormalizeRegistry, buildRegistryDocument, deriveWindowState } from '../models/registry.model.js';
import { buildLimitsAuditEntry } from '../models/limitsAudit.model.js';
import { AUDIT_RESOURCE, AUDIT_ACTION } from '../constants/index.js';
import { logger } from '../config/logger.js';

export class RegistryService {
  constructor(registryRepository, limitsAuditRepository, clientService, configCache) {
    this.registryRepository = registryRepository;
    this.limitsAuditRepository = limitsAuditRepository;
    this.clientService = clientService;
    this.configCache = configCache;
  }

  async getRegistry(clientId) {
    const doc = await this.registryRepository.findByClientId(clientId);
    if (!doc) {
      throw AppError.notFound(`No registry found for client '${clientId}'.`, 'REGISTRY_NOT_FOUND');
    }
    return doc;
  }

  /** Adds each window's derived `state` (STORY-02-03) so API consumers never have to recompute it themselves. */
  toView(registryDoc, now = new Date()) {
    return {
      ...registryDoc,
      allowedDimensions: registryDoc.allowedDimensions.map((dimension) => ({
        ...dimension,
        windows: Object.fromEntries(
          Object.entries(dimension.windows).map(([windowType, entry]) => [
            windowType,
            { ...entry, state: deriveWindowState(entry, now) },
          ]),
        ),
      })),
    };
  }

  /** STORY-02-01 — validated, versioned, atomically-swapped replace of a client's dimension registry. */
  async replaceRegistry(clientId, allowedDimensionsInput, actor) {
    const client = await this.clientService.getClient(clientId);
    const previous = await this.registryRepository.findByClientId(clientId);

    const normalizedDimensions = validateAndNormalizeRegistry(allowedDimensionsInput, {
      previousRegistry: previous,
      timezone: client.timezone,
      now: new Date(),
    });

    const now = new Date();
    const doc = buildRegistryDocument({
      clientId,
      allowedDimensions: normalizedDimensions,
      configVersion: (previous?.configVersion ?? 0) + 1,
      limitsVersion: previous?.limitsVersion ?? 0,
      actor,
      now,
    });
    if (previous) {
      doc.createdAt = previous.createdAt;
      doc.createdBy = previous.createdBy;
    }

    await this.registryRepository.replace(doc);

    await this.limitsAuditRepository.record(
      buildLimitsAuditEntry({
        clientId,
        resource: AUDIT_RESOURCE.REGISTRY,
        action: previous ? AUDIT_ACTION.REGISTRY_UPDATED : AUDIT_ACTION.REGISTRY_CREATED,
        actor,
        before: previous?.allowedDimensions ?? null,
        after: doc.allowedDimensions,
        now,
      }),
    );

    logger.info({ clientId, actor, configVersion: doc.configVersion }, 'Registry replaced');

    if (this.configCache) {
      await this.configCache.refreshOne(clientId);
    }

    return doc;
  }
}
