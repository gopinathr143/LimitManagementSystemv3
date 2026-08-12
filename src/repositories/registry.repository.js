import { normalizeRegistryDoc } from '../models/registry.model.js';

/**
 * Deliberately does NOT extend TenantScopedRepository — same reasoning as
 * ClientRepository (STORY-01-01): exactly one `clientConfigs` document
 * exists per client, keyed by `_id: clientId`, so there is no "other
 * tenant" a query here could leak into.
 */
export class RegistryRepository {
  constructor(collection) {
    this.collection = collection;
  }

  /** STORY-08-03 AC3 — normalized here, the single choke point, so every downstream caller only ever sees the per-direction `directions` map shape, never a legacy top-level `allowedDimensions` document. */
  async findByClientId(clientId) {
    return normalizeRegistryDoc(await this.collection.findOne({ _id: clientId }));
  }

  async replace(doc) {
    return this.collection.findOneAndUpdate(
      { _id: doc._id },
      { $set: doc },
      { upsert: true, returnDocument: 'after' },
    );
  }

  /** Version-tracking bump only — used by limit-definition writes so the cache knows to reload without a full registry re-validation. */
  async bumpLimitsVersion(clientId, now) {
    return this.collection.findOneAndUpdate(
      { _id: clientId },
      { $inc: { limitsVersion: 1 }, $set: { updatedAt: now } },
      { upsert: false, returnDocument: 'after' },
    );
  }

  async listActiveClientIds() {
    return this.collection.distinct('clientId');
  }
}
