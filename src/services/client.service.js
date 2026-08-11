import { AppError } from '../utils/AppError.js';
import { validateClientCreatePayload, validateClientUpdatePayload, buildClientDocument } from '../models/client.model.js';
import { buildAuditEntry } from '../models/configAudit.model.js';
import { CLIENT_STATUS, AUDIT_RESOURCE, AUDIT_ACTION } from '../constants/index.js';
import { logger } from '../config/logger.js';

const MONGO_DUPLICATE_KEY = 11000;

export class ClientService {
  constructor(clientRepository, configAuditRepository) {
    this.clientRepository = clientRepository;
    this.configAuditRepository = configAuditRepository;
  }

  async createClient(payload, actor) {
    validateClientCreatePayload(payload);

    const existing = await this.clientRepository.findByClientId(payload.clientId);
    if (existing) {
      throw AppError.conflict(`Client '${payload.clientId}' already exists.`, 'CLIENT_ALREADY_EXISTS');
    }

    const now = new Date();
    const doc = buildClientDocument({ clientId: payload.clientId, name: payload.name, timezone: payload.timezone, createdBy: actor, now });

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
}

export function isActive(client) {
  return client?.status === CLIENT_STATUS.ACTIVE;
}
