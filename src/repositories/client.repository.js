/**
 * Deliberately does NOT extend TenantScopedRepository: the `clients`
 * collection is the tenant directory itself — its documents ARE the
 * clientIds being governed, not data owned by one.
 */
export class ClientRepository {
  constructor(collection) {
    this.collection = collection;
  }

  async insert(doc) {
    return this.collection.insertOne(doc);
  }

  async findByClientId(clientId) {
    return this.collection.findOne({ _id: clientId });
  }

  async list({ limit = 50, skip = 0 } = {}) {
    return this.collection.find({}).skip(skip).limit(limit).sort({ createdAt: 1 }).toArray();
  }

  async updateByClientId(clientId, update) {
    return this.collection.findOneAndUpdate({ _id: clientId }, update, { returnDocument: 'after' });
  }

  /** Unpaginated on purpose — used to warm the in-process config cache (STORY-02-06) at startup. */
  async listActiveClientIds() {
    return this.collection.distinct('clientId', { status: 'ACTIVE' });
  }
}
