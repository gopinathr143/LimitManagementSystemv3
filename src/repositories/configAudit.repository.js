export class ConfigAuditRepository {
  constructor(collection) {
    this.collection = collection;
  }

  async record(entry) {
    return this.collection.insertOne(entry);
  }

  async listForClient(clientId, { limit = 50, skip = 0 } = {}) {
    return this.collection
      .find({ clientId })
      .sort({ occurredAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }
}
