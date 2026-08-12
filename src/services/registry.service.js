import { AppError } from '../utils/AppError.js';
import { validateAndNormalizeRegistry, buildRegistryDocument, deriveWindowState } from '../models/registry.model.js';
import { buildLimitsAuditEntry } from '../models/limitsAudit.model.js';
import { AUDIT_RESOURCE, AUDIT_ACTION, ALL_DIRECTIONS } from '../constants/index.js';
import { logger } from '../config/logger.js';

function assertValidDirection(direction) {
  if (!ALL_DIRECTIONS.includes(direction)) {
    throw AppError.badRequest(`direction must be one of ${ALL_DIRECTIONS.join(', ')}, got: ${direction}.`, 'DIRECTION_UNRECOGNIZED');
  }
}

/** BRD §4.3 / STORY-08-03 — the registry document root now carries a per-direction map; this service's public surface is direction-scoped throughout, while `validateAndNormalizeRegistry` (registry.model.js) keeps validating exactly one direction's dimension list at a time, unchanged from before EPIC-08. */
export class RegistryService {
  constructor(registryRepository, limitsAuditRepository, clientService, configCache) {
    this.registryRepository = registryRepository;
    this.limitsAuditRepository = limitsAuditRepository;
    this.clientService = clientService;
    this.configCache = configCache;
  }

  /** The full multi-direction document — used by admin/API reads. */
  async getRegistryDoc(clientId) {
    const doc = await this.registryRepository.findByClientId(clientId);
    if (!doc) {
      throw AppError.notFound(`No registry found for client '${clientId}'.`, 'REGISTRY_NOT_FOUND');
    }
    return doc;
  }

  /** Just one direction's registry, or null if that direction has never been configured. */
  async getRegistry(clientId, direction) {
    assertValidDirection(direction);
    const doc = await this.getRegistryDoc(clientId);
    return doc.directions?.[direction] ?? null;
  }

  #directionView(directionRegistry, now) {
    if (!directionRegistry) {
      return null;
    }
    return {
      allowedDimensions: directionRegistry.allowedDimensions.map((dimension) => ({
        ...dimension,
        windows: Object.fromEntries(
          Object.entries(dimension.windows).map(([windowType, entry]) => [windowType, { ...entry, state: deriveWindowState(entry, now) }]),
        ),
      })),
    };
  }

  /** Adds each window's derived `state` (STORY-02-03) so API consumers never have to recompute it themselves. `direction` narrows to one direction's view; omitted, every configured direction is returned. */
  toView(registryDoc, direction, now = new Date()) {
    if (direction) {
      assertValidDirection(direction);
      return { ...registryDoc, directions: { [direction]: this.#directionView(registryDoc.directions?.[direction], now) } };
    }
    const directions = {};
    for (const [dir, directionRegistry] of Object.entries(registryDoc.directions ?? {})) {
      directions[dir] = this.#directionView(directionRegistry, now);
    }
    return { ...registryDoc, directions };
  }

  /**
   * STORY-02-01 / STORY-08-03 — validated, versioned, atomically-swapped
   * replace of ONE direction's dimension registry. AC4 — both directions
   * live in the same physical document, so a change to one direction still
   * bumps a single shared `configVersion` in one atomic write; the other
   * direction's snapshot is carried forward untouched, never re-validated.
   */
  async replaceRegistry(clientId, direction, allowedDimensionsInput, actor) {
    assertValidDirection(direction);
    const client = await this.clientService.getClient(clientId);
    const previousDoc = await this.registryRepository.findByClientId(clientId);
    const previousDirectionRegistry = previousDoc?.directions?.[direction] ?? null;

    const normalizedDimensions = validateAndNormalizeRegistry(allowedDimensionsInput, {
      previousRegistry: previousDirectionRegistry,
      timezone: client.timezone,
      now: new Date(),
    });

    const now = new Date();
    const mergedDirections = { ...(previousDoc?.directions ?? {}), [direction]: { allowedDimensions: normalizedDimensions } };
    const doc = buildRegistryDocument({
      clientId,
      directions: mergedDirections,
      configVersion: (previousDoc?.configVersion ?? 0) + 1,
      limitsVersion: previousDoc?.limitsVersion ?? 0,
      actor,
      now,
    });
    if (previousDoc) {
      doc.createdAt = previousDoc.createdAt;
      doc.createdBy = previousDoc.createdBy;
    }

    await this.registryRepository.replace(doc);

    await this.limitsAuditRepository.record(
      buildLimitsAuditEntry({
        clientId,
        resource: AUDIT_RESOURCE.REGISTRY,
        action: previousDirectionRegistry ? AUDIT_ACTION.REGISTRY_UPDATED : AUDIT_ACTION.REGISTRY_CREATED,
        actor,
        before: previousDirectionRegistry?.allowedDimensions ?? null,
        after: normalizedDimensions,
        now,
      }),
    );

    logger.info({ clientId, direction, actor, configVersion: doc.configVersion }, 'Registry replaced');

    if (this.configCache) {
      await this.configCache.refreshOne(clientId);
    }

    return doc;
  }
}
