import { TenantScopedRepository } from './base.repository.js';
import { PRIMARY_READ_OPTS, HOT_PATH_WRITE_OPTS, MAJORITY_WRITE_OPTS } from '../config/database.js';

const MONGO_DUPLICATE_KEY = 11000;

/**
 * BRD §4.2 — the velocity counter store. Extends TenantScopedRepository:
 * counter documents carry `clientId` as a plain field (STORY-03-01 AC4)
 * precisely so this structural guard applies here too.
 *
 * BRD §4.6 — every read here MUST target the primary (a stale secondary
 * read over-approves); every mutating call here is on the hot path and
 * uses `w:1`. These are passed explicitly on every call, never left to a
 * driver default (STORY-03-07).
 */
export class CounterRepository extends TenantScopedRepository {
  /**
   * BRD §4.2.1 Step A — unconditional bootstrap. `$setOnInsert` only, never
   * `$set`, so a bootstrap call can never mutate an existing document's
   * balance. A concurrent duplicate-bootstrap race raises E11000, which is
   * benign here (someone else won) and is swallowed — this is the ONLY
   * place in the counter engine E11000 is expected or tolerated.
   */
  async bootstrap(clientId, key, doc) {
    try {
      await this.updateOne(clientId, { _id: key }, { $setOnInsert: doc }, { upsert: true, ...HOT_PATH_WRITE_OPTS });
    } catch (error) {
      if (error?.code !== MONGO_DUPLICATE_KEY) {
        throw error;
      }
    }
  }

  /**
   * BRD §4.2.1 Step B — the defect-fix step (STORY-03-03). `upsert` is
   * hard-coded `false` here and not accepted as a parameter, so this
   * method cannot structurally be called with upsert enabled — the
   * combination that turned a genuine breach into an E11000 in earlier
   * BRD versions. `guardFilter` carries only the amount/count range
   * clauses that are actually configured (§2.3.1 inclusive-maxima).
   */
  async guardedIncrement(clientId, key, { guardFilter, amountDelta, countDelta, now }) {
    return this.updateOne(
      clientId,
      { _id: key, ...guardFilter },
      { $inc: { amount: amountDelta, count: countDelta }, $set: { updatedAt: now } },
      { upsert: false, ...HOT_PATH_WRITE_OPTS },
    );
  }

  /** BRD §3.4 floor guard — reversal decrement, never below zero. `upsert` is hard-coded `false` for the same reason as `guardedIncrement`. */
  async guardedDecrement(clientId, key, { amountDelta, countDelta, now }) {
    const guardFilter = { amount: { $gte: amountDelta } };
    if (countDelta) {
      guardFilter.count = { $gte: countDelta };
    }
    return this.updateOne(
      clientId,
      { _id: key, ...guardFilter },
      { $inc: { amount: -amountDelta, count: -countDelta }, $set: { updatedAt: now } },
      { upsert: false, ...HOT_PATH_WRITE_OPTS },
    );
  }

  /**
   * BRD §4.2.2 — Tier 2, unconditional in-place increment; bootstrap and
   * increment are one round trip since there is no guard to race against.
   *
   * Two concurrent first-writers to the same not-yet-existing shard can
   * both see "no matching document" and both attempt the insert half of
   * the upsert — exactly the benign bootstrap race `bootstrap()` handles,
   * except here the increment must never be lost (unlike a bootstrap,
   * where the loser simply proceeds to its own next step). On E11000 the
   * document now exists (the winner created it), so retrying the identical
   * call applies this caller's increment normally instead of dropping it.
   */
  async incrementShardUnconditional(clientId, key, { amountDelta, countDelta, now, expireAt }) {
    const attempt = () =>
      this.updateOne(
        clientId,
        { _id: key },
        {
          $inc: { amount: amountDelta, count: countDelta },
          $set: { updatedAt: now },
          $setOnInsert: { clientId, createdAt: now, expireAt },
        },
        { upsert: true, ...HOT_PATH_WRITE_OPTS },
      );

    try {
      return await attempt();
    } catch (error) {
      if (error?.code !== MONGO_DUPLICATE_KEY) {
        throw error;
      }
      return attempt();
    }
  }

  /** BRD §4.2.2 "logical total = sum of that client's buckets" — always primary, never cached at this layer (caching lives in the service, STORY-03-04). */
  async sumKeys(clientId, keys) {
    const docs = await this.find(clientId, { _id: { $in: keys } }, PRIMARY_READ_OPTS);
    return docs.reduce((totals, doc) => ({ amount: totals.amount + (doc.amount ?? 0), count: totals.count + (doc.count ?? 0) }), {
      amount: 0,
      count: 0,
    });
  }

  /**
   * Sharded-rolling read (STORY-03-06 AC6): a shard document's `buckets`
   * are only pruned as a side effect of a *write* to that specific
   * document, so an accurate read across several shards must re-apply the
   * horizon filter itself rather than trust whatever each doc last pruned to.
   */
  async sumRollingKeys(clientId, keys, oldestValidBucketLabel) {
    const docs = await this.find(clientId, { _id: { $in: keys } }, PRIMARY_READ_OPTS);
    let amount = 0;
    let count = 0;
    for (const doc of docs) {
      for (const [bucketLabel, bucket] of Object.entries(doc.buckets ?? {})) {
        if (bucketLabel >= oldestValidBucketLabel) {
          amount += bucket.a ?? 0;
          count += bucket.c ?? 0;
        }
      }
    }
    return { amount, count };
  }

  /**
   * BRD §4.2.5 — the rolling-window aggregation-pipeline update. The Node
   * driver accepts an array as `update` for pipeline-style updates;
   * findOneAndUpdate is inherently primary-routed (writes cannot target
   * secondaries). Same benign concurrent-bootstrap race as
   * `incrementShardUnconditional` — retried once on E11000 rather than
   * dropped, since the pipeline's own $inc-equivalent must never be lost.
   */
  async rollingPipelineUpdate(clientId, key, pipeline) {
    const attempt = () => this.findOneAndUpdate(clientId, { _id: key }, pipeline, { upsert: true, returnDocument: 'after', ...HOT_PATH_WRITE_OPTS });
    try {
      return await attempt();
    } catch (error) {
      if (error?.code !== MONGO_DUPLICATE_KEY) {
        throw error;
      }
      return attempt();
    }
  }

  async findByKey(clientId, key) {
    return this.findOne(clientId, { _id: key }, PRIMARY_READ_OPTS);
  }

  /**
   * BRD §3.4 floor guard, applied to one hourly/minute sub-bucket rather
   * than a top-level `amount`/`count` field. `matchedCount === 0` covers
   * both a floor-guard failure and a bucket that has since been pruned
   * (aged out of the 24h horizon) — either way there is nothing safe to
   * decrement, and the caller treats it as a drift signal (§3.4/§3.5).
   */
  async decrementRollingBucket(clientId, key, { bucketLabel, amountDelta, countDelta, now }) {
    return this.updateOne(
      clientId,
      { _id: key, [`buckets.${bucketLabel}.a`]: { $gte: amountDelta }, [`buckets.${bucketLabel}.c`]: { $gte: countDelta } },
      { $inc: { [`buckets.${bucketLabel}.a`]: -amountDelta, [`buckets.${bucketLabel}.c`]: -countDelta }, $set: { updatedAt: now } },
      { upsert: false, ...HOT_PATH_WRITE_OPTS },
    );
  }

  /**
   * BRD §3.5 "a full nightly pass per closed window" — a flat (non-rolling)
   * counter document whose window has already closed (`now >= expireAt`) is
   * eligible for the general sweep. Rolling documents (identified by the
   * presence of a `buckets` field) are deliberately excluded: a rolling
   * window is a continuous 24h sliding horizon that never "closes", so the
   * closed-window trigger this method serves does not apply to it
   * (STORY-05-02 scope note — rolling drift signals are alert-only,
   * never auto-corrected, regardless of trigger).
   */
  async findFlatCountersDueForSweep(clientId, now, limit = 500) {
    return this.collection
      .find({ clientId, buckets: { $exists: false }, expireAt: { $lte: now } }, PRIMARY_READ_OPTS)
      .limit(limit)
      .toArray();
  }

  /**
   * BRD §3.5 "corrects the counter [to] the value derived from `transactions`."
   * An administrative overwrite, never on the hot path — `w:majority` for
   * durability of the correction itself, unlike the `w:1` increments it repairs.
   */
  async correctCounterValue(clientId, key, { amount, count, now }) {
    return this.updateOne(clientId, { _id: key }, { $set: { amount, count, updatedAt: now, reconciledAt: now } }, { upsert: false, ...MAJORITY_WRITE_OPTS });
  }
}
