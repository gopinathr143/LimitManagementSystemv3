import { AppError } from '../utils/AppError.js';
import { validateClientCreatePayload, validateClientUpdatePayload, buildClientDocument } from '../models/client.model.js';
import { buildAuditEntry } from '../models/configAudit.model.js';
import { findDimension } from '../models/registry.model.js';
import { CLIENT_STATUS, AUDIT_RESOURCE, AUDIT_ACTION, ALL_DIRECTIONS, GLOBAL_DIMENSION_CODE, PER_TXN_WINDOW_TYPE } from '../constants/index.js';
import { logger } from '../config/logger.js';

const MONGO_DUPLICATE_KEY = 11000;

export class ClientService {
  constructor(clientRepository, configAuditRepository, registryRepository, limitDefinitionRepository) {
    this.clientRepository = clientRepository;
    this.configAuditRepository = configAuditRepository;
    this.registryRepository = registryRepository;
    this.limitDefinitionRepository = limitDefinitionRepository;
  }

  async createClient(payload, actor) {
    const { enabledDirections } = validateClientCreatePayload(payload);

    const existing = await this.clientRepository.findByClientId(payload.clientId);
    if (existing) {
      throw AppError.conflict(`Client '${payload.clientId}' already exists.`, 'CLIENT_ALREADY_EXISTS');
    }

    const now = new Date();
    const doc = buildClientDocument({ clientId: payload.clientId, name: payload.name, timezone: payload.timezone, enabledDirections, createdBy: actor, now });

    try {
      await this.clientRepository.insert(doc);
    } catch (error) {
      if (error?.code === MONGO_DUPLICATE_KEY) {
        throw AppError.conflict(`Client '${payload.clientId}' already exists.`, 'CLIENT_ALREADY_EXISTS');
      }
      throw error;
    }

    await this.configAuditRepository.record(
      buildAuditEntry({ clientId: doc.clientId, resource: AUDIT_RESOURCE.CLIENT, action: AUDIT_ACTION.CLIENT_CREATED, actor, before: null, after: doc, now }),
    );

    logger.info({ clientId: doc.clientId, actor }, 'Client onboarded');

    return { client: doc };
  }

  async listClients(pagination) {
    return this.clientRepository.list(pagination);
  }

  async getClient(clientId) {
    const client = await this.clientRepository.findByClientId(clientId);
    if (!client) {
      throw AppError.notFound(`Client '${clientId}' not found.`, 'CLIENT_NOT_FOUND');
    }
    return client;
  }

  async updateClient(clientId, payload, actor) {
    validateClientUpdatePayload(payload);

    const existing = await this.clientRepository.findByClientId(clientId);
    if (!existing) {
      throw AppError.notFound(`Client '${clientId}' not found.`, 'CLIENT_NOT_FOUND');
    }

    const now = new Date();
    const setFields = { updatedAt: now };
    let action = AUDIT_ACTION.CLIENT_UPDATED;

    if (payload.name !== undefined) {
      setFields.name = payload.name;
    }
    if (payload.timezone !== undefined) {
      setFields.timezone = payload.timezone;
      action = AUDIT_ACTION.CLIENT_TIMEZONE_CHANGED;
    }
    if (payload.status !== undefined && payload.status !== existing.status) {
      setFields.status = payload.status;
      action = AUDIT_ACTION.CLIENT_STATUS_CHANGED;
    }

    const updated = await this.clientRepository.updateByClientId(clientId, { $set: setFields });

    await this.configAuditRepository.record(
      buildAuditEntry({ clientId, resource: AUDIT_RESOURCE.CLIENT, action, actor, before: existing, after: updated, now }),
    );

    logger.info({ clientId, actor, action }, 'Client updated');

    return { client: updated };
  }

  /**
   * BRD §2.1.8 / STORY-08-03 AC5 — "a direction being enabled without a valid
   * registry or without its mandatory Global Per-Transaction limit is
   * rejected, so no window exists in which traffic is accepted but
   * ungoverned." Guards enablement the same way client onboarding itself is
   * fail-closed: the check happens before the flag is ever persisted.
   */
  async setEnabledDirections(clientId, directions, actor) {
    if (!Array.isArray(directions) || directions.length === 0 || !directions.every((d) => ALL_DIRECTIONS.includes(d))) {
      throw AppError.badRequest(`directions must be a non-empty array drawn from ${ALL_DIRECTIONS.join(', ')}.`, 'VALIDATION_ERROR');
    }

    const existing = await this.getClient(clientId);
    const newlyEnabled = directions.filter((d) => !existing.enabledDirections?.includes(d));

    if (newlyEnabled.length > 0) {
      const registryDoc = await this.registryRepository.findByClientId(clientId);
      for (const direction of newlyEnabled) {
        const directionRegistry = registryDoc?.directions?.[direction];
        const globalDimension = directionRegistry ? findDimension(directionRegistry, GLOBAL_DIMENSION_CODE) : null;
        if (!globalDimension) {
          throw AppError.badRequest(
            `Cannot enable direction '${direction}': no registry with the mandatory '${GLOBAL_DIMENSION_CODE}' dimension exists for it yet.`,
            'DIRECTION_REGISTRY_INCOMPLETE',
          );
        }
        // eslint-disable-next-line no-await-in-loop
        const definitions = await this.limitDefinitionRepository.listAllForCache(clientId);
        const hasGlobalPerTxn = definitions.some(
          (def) => def.direction === direction && def.dimensionCode === GLOBAL_DIMENSION_CODE && def.windowType === PER_TXN_WINDOW_TYPE && def.isActive,
        );
        if (!hasGlobalPerTxn) {
          throw AppError.badRequest(
            `Cannot enable direction '${direction}': no active mandatory Global Per-Transaction limit exists for it yet (BRD §5).`,
            'DIRECTION_GLOBAL_PER_TXN_MISSING',
          );
        }
      }
    }

    const now = new Date();
    const updated = await this.clientRepository.updateByClientId(clientId, { $set: { enabledDirections: directions, updatedAt: now } });

    await this.configAuditRepository.record(
      buildAuditEntry({ clientId, resource: AUDIT_RESOURCE.CLIENT, action: AUDIT_ACTION.CLIENT_UPDATED, actor, before: existing, after: updated, now }),
    );

    logger.info({ clientId, actor, directions }, 'Client enabled directions changed');

    return { client: updated };
  }
}

export function isActive(client) {
  return client?.status === CLIENT_STATUS.ACTIVE;
}
