/**
 * BRD §2.1.3 / STORY-01-03 — every collection carries a mandatory clientId
 * discriminator, and every query, key and index leads with it. This base
 * class is the structural enforcement of that rule: every tenant-scoped
 * repository (limits, counters, transactions, ... in later epics) extends
 * it and gets isolation "for free" rather than relying on each call site to
 * remember a filter clause.
 *
 * It is deliberately NOT used by ClientRepository — the `clients` collection
 * is the tenant directory itself (its documents ARE the clientIds), not
 * tenant-owned data, so there is no "other" clientId to guard against there.
 */
export class TenantScopedRepository {
  constructor(collection) {
    this.collection = collection;
  }

  #assertClientId(clientId) {
    if (typeof clientId !== 'string' || clientId.trim() === '') {
      throw new TypeError(
        `${this.constructor.name}: clientId is required on every query/write. ` +
          'A query built without it would risk cross-tenant data access.',
      );
    }
  }

  #scoped(clientId, filter = {}) {
    this.#assertClientId(clientId);
    if (Object.prototype.hasOwnProperty.call(filter, 'clientId') && filter.clientId !== clientId) {
      throw new TypeError(`${this.constructor.name}: filter.clientId does not match the scoping clientId.`);
    }
    return { ...filter, clientId };
  }

  async findOne(clientId, filter = {}, options = {}) {
    return this.collection.findOne(this.#scoped(clientId, filter), options);
  }

  async find(clientId, filter = {}, options = {}) {
    return this.collection.find(this.#scoped(clientId, filter), options).toArray();
  }

  async insertOne(clientId, doc, options = {}) {
    this.#assertClientId(clientId);
    if (doc.clientId !== undefined && doc.clientId !== clientId) {
      throw new TypeError(`${this.constructor.name}: doc.clientId does not match the scoping clientId.`);
    }
    return this.collection.insertOne({ ...doc, clientId }, options);
  }

  async updateOne(clientId, filter, update, options = {}) {
    return this.collection.updateOne(this.#scoped(clientId, filter), update, options);
  }

  async findOneAndUpdate(clientId, filter, update, options = {}) {
    return this.collection.findOneAndUpdate(this.#scoped(clientId, filter), update, options);
  }

  async deleteOne(clientId, filter, options = {}) {
    return this.collection.deleteOne(this.#scoped(clientId, filter), options);
  }

  async countDocuments(clientId, filter = {}, options = {}) {
    return this.collection.countDocuments(this.#scoped(clientId, filter), options);
  }
}
