import { AppError } from '../utils/AppError.js';
import { generateApiKey, hashApiKey, fingerprintOf } from '../utils/crypto.js';
import {
  validateClientCreatePayload,
  validateClientUpdatePayload,
  buildClientDocument,
  sanitizeClient,
} from '../models/client.model.js';
import { buildAuditEntry } from '../models/configAudit.model.js';
import { CLIENT_STATUS, AUTH_BINDING_TYPE, AUDIT_RESOURCE, AUDIT_ACTION } from '../constants/index.js';
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

    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const now = new Date();

    const doc = buildClientDocument({
      clientId: payload.clientId,
      name: payload.name,
      timezone: payload.timezone,
      authBinding: {
        type: AUTH_BINDING_TYPE.API_KEY,
        apiKeyHash,
        fingerprint: fingerprintOf(apiKeyHash),
        rotatedAt: now,
      },
      createdBy: actor,
      now,
    });

    try {
      await this.clientRepository.insert(doc);
    } catch (error) {
      if (error?.code === MONGO_DUPLICATE_KEY) {
        throw AppError.conflict(`Client '${payload.clientId}' already exists.`, 'CLIENT_ALREADY_EXISTS');
      }
      throw error;
    }

    await this.configAuditRepository.record(
      buildAuditEntry({
        clientId: doc.clientId,
        resource: AUDIT_RESOURCE.CLIENT,
        action: AUDIT_ACTION.CLIENT_CREATED,
        actor,
        before: null,
        after: sanitizeClient(doc),
        now,
      }),
    );

    logger.info({ clientId: doc.clientId, actor }, 'Client onboarded');

    // The plaintext apiKey is returned exactly once, at creation/rotation time, and never stored or logged.
    return { client: sanitizeClient(doc), apiKey };
  }

  async listClients(pagination) {
    const clients = await this.clientRepository.list(pagination);
    return clients.map(sanitizeClient);
  }

  async getClient(clientId) {
    const client = await this.clientRepository.findByClientId(clientId);
    if (!client) {
      throw AppError.notFound(`Client '${clientId}' not found.`, 'CLIENT_NOT_FOUND');
    }
    return sanitizeClient(client);
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
    let rotatedApiKey;

    if (payload.name !== undefined) {
      setFields.name = payload.name;
    }
    if (payload.timezone !== undefined) {
      setFields.timezone = payload.timezone;
      action = AUDIT_ACTION.CLIENT_TIMEZONE_CHANGED;
    }
    if (payload.rotateAuth === true) {
      rotatedApiKey = generateApiKey();
      const apiKeyHash = hashApiKey(rotatedApiKey);
      setFields.authBinding = {
        type: AUTH_BINDING_TYPE.API_KEY,
        apiKeyHash,
        fingerprint: fingerprintOf(apiKeyHash),
        rotatedAt: now,
      };
      action = AUDIT_ACTION.CLIENT_AUTH_ROTATED;
    }
    if (payload.status !== undefined && payload.status !== existing.status) {
      setFields.status = payload.status;
      action = AUDIT_ACTION.CLIENT_STATUS_CHANGED;
    }

    const updated = await this.clientRepository.updateByClientId(clientId, { $set: setFields });

    await this.configAuditRepository.record(
      buildAuditEntry({
        clientId,
        resource: AUDIT_RESOURCE.CLIENT,
        action,
        actor,
        before: sanitizeClient(existing),
        after: sanitizeClient(updated),
        now,
      }),
    );

    logger.info({ clientId, actor, action }, 'Client updated');

    const result = { client: sanitizeClient(updated) };
    if (rotatedApiKey) {
      result.apiKey = rotatedApiKey;
    }
    return result;
  }

  /**
   * STORY-01-02 — resolves the authenticated principal's clientId from the
   * credential alone. Returns null (never throws) on an unknown credential
   * so the caller can apply uniform fail-closed handling and logging.
   */
  async resolveByApiKey(apiKey) {
    const apiKeyHash = hashApiKey(apiKey);
    const client = await this.clientRepository.findByApiKeyHash(apiKeyHash);
    return { client, fingerprint: fingerprintOf(apiKeyHash) };
  }
}

export function isActive(client) {
  return client?.status === CLIENT_STATUS.ACTIVE;
}
