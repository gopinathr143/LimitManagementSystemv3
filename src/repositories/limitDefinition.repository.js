import { ObjectId } from 'mongodb';
import { TenantScopedRepository } from './base.repository.js';

/**
 * Many documents per client — this is exactly the shape STORY-01-03's
 * TenantScopedRepository guard exists for, unlike `clients`/`clientConfigs`
 * (one document per client, keyed by clientId itself).
 */
export class LimitDefinitionRepository extends TenantScopedRepository {
  async insert(clientId, doc) {
    const result = await this.insertOne(clientId, doc);
    return { _id: result.insertedId, ...doc, clientId };
  }

  async findById(clientId, id) {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return this.findOne(clientId, { _id: new ObjectId(id) });
  }

  async listAll(clientId, { dimensionCode, windowType } = {}) {
    const filter = {};
    if (dimensionCode) {
      filter.dimensionCode = dimensionCode;
    }
    if (windowType) {
      filter.windowType = windowType;
    }
    return this.find(clientId, filter);
  }

  /** Everything an ACTIVE definition might need — this is what the cache (STORY-02-06) loads per client. */
  async listAllForCache(clientId) {
    return this.find(clientId, {});
  }

  async updateById(clientId, id, update) {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return this.findOneAndUpdate(clientId, { _id: new ObjectId(id) }, update, { returnDocument: 'after' });
  }
}
