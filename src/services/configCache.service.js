import { freezeRegistry } from '../models/registry.model.js';
import { deepFreeze } from '../utils/deepFreeze.js';
import { logger } from '../config/logger.js';

const DEFAULT_REFRESH_INTERVAL_MS = 2000;

/**
 * STORY-02-06 — the in-process cache the transaction path reads from
 * instead of MongoDB. Two invalidation paths, per BRD §4.4: an immediate
 * push right after a CRUD write (`refreshOne`, called by registry/limit
 * services) and a periodic poll (`startPolling`) as the cross-instance
 * backstop for changes made by another process.
 *
 * Frozen snapshots are swapped in with a single `Map.set()` call — never
 * mutated in place — so a concurrent `get()` always observes either the
 * fully-old or fully-new snapshot, never a partial one (STORY-02-01 AC4).
 */
export class ConfigCache {
  constructor(registryRepository, limitDefinitionRepository, { refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS } = {}) {
    this.registryRepository = registryRepository;
    this.limitDefinitionRepository = limitDefinitionRepository;
    this.refreshIntervalMs = refreshIntervalMs;
    this.entries = new Map();
    this.timer = null;
  }

  get(clientId) {
    return this.entries.get(clientId) ?? null;
  }

  getRegistry(clientId) {
    return this.entries.get(clientId)?.registry ?? null;
  }

  getDefinitions(clientId) {
    return this.entries.get(clientId)?.definitions ?? null;
  }

  /** STORY-02-06 AC3 — on failure, the previous entry (if any) is left completely untouched. */
  async refreshOne(clientId) {
    try {
      const [registryDoc, definitions] = await Promise.all([
        this.registryRepository.findByClientId(clientId),
        this.limitDefinitionRepository.listAllForCache(clientId),
      ]);

      const entry = {
        registry: registryDoc ? freezeRegistry(registryDoc) : null,
        // Fresh objects from .toArray() each call — no aliasing to defend
        // against, and no structuredClone (it silently strips ObjectId's
        // prototype down to a plain buffer object).
        definitions: Object.freeze(definitions.map((def) => deepFreeze(def))),
        loadedAt: new Date(),
      };
      this.entries.set(clientId, entry);
      return entry;
    } catch (error) {
      logger.error({ err: error, clientId }, 'Config cache refresh failed — retaining last known good snapshot');
      return this.entries.get(clientId) ?? null;
    }
  }

  async refreshAll(clientIds) {
    const ids = clientIds ?? [...this.entries.keys()];
    await Promise.all(ids.map((id) => this.refreshOne(id)));
  }

  async warm(clientIds) {
    await Promise.all(clientIds.map((id) => this.refreshOne(id)));
  }

  startPolling() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.refreshAll().catch((error) => logger.error({ err: error }, 'Config cache poll cycle failed'));
    }, this.refreshIntervalMs);
    this.timer.unref?.();
  }

  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
