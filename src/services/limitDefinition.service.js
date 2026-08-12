import { AppError } from '../utils/AppError.js';
import {
  validateLimitDefinitionCreate,
  validateLimitDefinitionUpdate,
  buildLimitDefinitionDocument,
  evaluateEffectiveness,
} from '../models/limitDefinition.model.js';
import { buildLimitsAuditEntry } from '../models/limitsAudit.model.js';
import { AUDIT_RESOURCE, AUDIT_ACTION } from '../constants/index.js';
import { logger } from '../config/logger.js';

/** STORY-08-05 — every definition carries an immutable `direction`; effectiveness now also depends on whether that specific direction is enabled for the client (AC5), not just the registry/window gates STORY-02-05 already covered. */
export class LimitDefinitionService {
  constructor(limitDefinitionRepository, limitsAuditRepository, registryRepository, registryService, configCache, clientService) {
    this.limitDefinitionRepository = limitDefinitionRepository;
    this.limitsAuditRepository = limitsAuditRepository;
    this.registryRepository = registryRepository;
    this.registryService = registryService;
    this.configCache = configCache;
    this.clientService = clientService;
  }

  /** The full multi-direction registry doc — callers pick the direction sub-object they need. */
  async #getRegistryDoc(clientId) {
    const cached = this.configCache?.get(clientId);
    if (cached?.registry) {
      return cached.registry;
    }
    try {
      return await this.registryService.getRegistryDoc(clientId);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  #withEffectiveness(definition, registryDoc, enabledDirections, now) {
    const directionRegistry = registryDoc?.directions?.[definition.direction] ?? null;
    const outcome = directionRegistry
      ? evaluateEffectiveness(definition, directionRegistry, now, enabledDirections)
      : evaluateEffectiveness(definition, null, now, enabledDirections);
    return { ...definition, effective: outcome.effective, effectivenessReason: outcome.reason, effectivenessMessage: outcome.message };
  }

  async #bumpLimitsVersionAndRefresh(clientId) {
    const now = new Date();
    await this.registryRepository.bumpLimitsVersion(clientId, now);
    if (this.configCache) {
      await this.configCache.refreshOne(clientId);
    }
  }

  /** STORY-02-04 create + STORY-02-05 inert-definition warning + STORY-08-05 direction-gate warning. */
  async createDefinition(clientId, payload, actor) {
    const normalized = validateLimitDefinitionCreate(payload);
    const now = new Date();
    const doc = buildLimitDefinitionDocument({ clientId, normalized, actor, now });

    const inserted = await this.limitDefinitionRepository.insert(clientId, doc);

    await this.limitsAuditRepository.record(
      buildLimitsAuditEntry({
        clientId,
        resource: AUDIT_RESOURCE.LIMIT_DEFINITION,
        action: AUDIT_ACTION.LIMIT_DEFINITION_CREATED,
        actor,
        definitionVersion: inserted.definitionVersion,
        before: null,
        after: inserted,
        now,
      }),
    );

    logger.info({ clientId, actor, direction: doc.direction, dimensionCode: doc.dimensionCode, windowType: doc.windowType }, 'Limit definition created');

    await this.#bumpLimitsVersionAndRefresh(clientId);

    const client = await this.clientService.getClient(clientId);
    const registryDoc = await this.#getRegistryDoc(clientId);
    return this.#withEffectiveness(inserted, registryDoc, client.enabledDirections, now);
  }

  /** `filter.direction` narrows the list; omitted returns every direction's definitions, each evaluated against its own direction's registry and enablement. */
  async listDefinitions(clientId, filter) {
    const definitions = await this.limitDefinitionRepository.listAll(clientId, filter);
    const client = await this.clientService.getClient(clientId);
    const registryDoc = await this.#getRegistryDoc(clientId);
    const now = new Date();
    return definitions.map((definition) => this.#withEffectiveness(definition, registryDoc, client.enabledDirections, now));
  }

  async getDefinition(clientId, id) {
    const definition = await this.limitDefinitionRepository.findById(clientId, id);
    if (!definition) {
      throw AppError.notFound(`Limit definition '${id}' not found for client '${clientId}'.`, 'LIMIT_DEFINITION_NOT_FOUND');
    }
    const client = await this.clientService.getClient(clientId);
    const registryDoc = await this.#getRegistryDoc(clientId);
    return this.#withEffectiveness(definition, registryDoc, client.enabledDirections, new Date());
  }

  async updateDefinition(clientId, id, payload, actor) {
    const update = validateLimitDefinitionUpdate(payload);
    const existing = await this.limitDefinitionRepository.findById(clientId, id);
    if (!existing) {
      throw AppError.notFound(`Limit definition '${id}' not found for client '${clientId}'.`, 'LIMIT_DEFINITION_NOT_FOUND');
    }

    const now = new Date();
    const updated = await this.limitDefinitionRepository.updateById(clientId, id, {
      $set: { ...update, updatedBy: actor, updatedAt: now },
      $inc: { definitionVersion: 1 },
    });

    await this.limitsAuditRepository.record(
      buildLimitsAuditEntry({
        clientId,
        resource: AUDIT_RESOURCE.LIMIT_DEFINITION,
        action: AUDIT_ACTION.LIMIT_DEFINITION_UPDATED,
        actor,
        definitionVersion: updated.definitionVersion,
        before: existing,
        after: updated,
        now,
      }),
    );

    logger.info({ clientId, actor, id, definitionVersion: updated.definitionVersion }, 'Limit definition updated');

    await this.#bumpLimitsVersionAndRefresh(clientId);

    const client = await this.clientService.getClient(clientId);
    const registryDoc = await this.#getRegistryDoc(clientId);
    return this.#withEffectiveness(updated, registryDoc, client.enabledDirections, now);
  }

  /** BRD §4.4 DELETE — soft-deactivate so definitionVersion history and the audit trail stay intact. */
  async deactivateDefinition(clientId, id, actor) {
    const existing = await this.limitDefinitionRepository.findById(clientId, id);
    if (!existing) {
      throw AppError.notFound(`Limit definition '${id}' not found for client '${clientId}'.`, 'LIMIT_DEFINITION_NOT_FOUND');
    }
    const client = await this.clientService.getClient(clientId);
    if (!existing.isActive) {
      return this.#withEffectiveness(existing, await this.#getRegistryDoc(clientId), client.enabledDirections, new Date());
    }

    const now = new Date();
    const updated = await this.limitDefinitionRepository.updateById(clientId, id, {
      $set: { isActive: false, updatedBy: actor, updatedAt: now },
      $inc: { definitionVersion: 1 },
    });

    await this.limitsAuditRepository.record(
      buildLimitsAuditEntry({
        clientId,
        resource: AUDIT_RESOURCE.LIMIT_DEFINITION,
        action: AUDIT_ACTION.LIMIT_DEFINITION_DEACTIVATED,
        actor,
        definitionVersion: updated.definitionVersion,
        before: existing,
        after: updated,
        now,
      }),
    );

    logger.info({ clientId, actor, id }, 'Limit definition deactivated');

    await this.#bumpLimitsVersionAndRefresh(clientId);

    return this.#withEffectiveness(updated, await this.#getRegistryDoc(clientId), client.enabledDirections, now);
  }
}
