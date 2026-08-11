/**
 * BRD §4.2.5 / STORY-03-06 — the rolling 24-hour window as a single
 * per-entity document with hourly (or minute) sub-buckets, updated by one
 * atomic aggregation-pipeline `findOneAndUpdate`. This is what makes the
 * per-entity rolling guarantee strict: the prune → sum → conditional
 * increment sequence is one document operation, so no concurrent
 * transaction can interleave between the sum and the write.
 *
 * The BRD's own illustrative snippet (§4.2.5) writes `{ $sum: "$buckets.a" }`
 * against `buckets` as a plain object — that is pseudocode, not a literal
 * MongoDB expression; a `$sum` accumulator needs an actual array of
 * numbers. The pipeline built here does the real object→array→sum
 * conversion (`$objectToArray` + `$map` + `$sum`) that the sketch elides.
 */

function sumBucketField(field) {
  return { $sum: { $map: { input: { $objectToArray: '$buckets' }, as: 'b', in: `$$b.v.${field}` } } };
}

function pruneBucketsStage(oldestValidBucketLabel) {
  return {
    $set: {
      buckets: {
        $arrayToObject: {
          $filter: {
            input: { $objectToArray: { $ifNull: ['$buckets', {}] } },
            cond: { $gte: ['$$this.k', oldestValidBucketLabel] },
          },
        },
      },
    },
  };
}

function sumStage() {
  return { $set: { _sumA: sumBucketField('a'), _sumC: sumBucketField('c') } };
}

function appliedGuardStage({ thresholdAmount, thresholdCount, amountDelta, countDelta }) {
  const clauses = [];
  if (thresholdAmount !== undefined && thresholdAmount !== null) {
    clauses.push({ $lte: [{ $add: ['$_sumA', amountDelta] }, thresholdAmount] });
  }
  if (thresholdCount !== undefined && thresholdCount !== null) {
    clauses.push({ $lte: [{ $add: ['$_sumC', countDelta] }, thresholdCount] });
  }
  // No configured threshold at all ⇒ "Undefined = Unlimited" (BRD §2.3) ⇒ always applied.
  return { $set: { _applied: clauses.length > 0 ? { $and: clauses } : true } };
}

function mergeCurrentBucketStage({ currentBucketLabel, amountDelta, countDelta, conditionalOnApplied }) {
  const incrementedBucket = {
    a: { $add: [{ $ifNull: [`$buckets.${currentBucketLabel}.a`, 0] }, amountDelta] },
    c: { $add: [{ $ifNull: [`$buckets.${currentBucketLabel}.c`, 0] }, countDelta] },
  };
  const merged = { $mergeObjects: ['$buckets', { [currentBucketLabel]: incrementedBucket }] };
  return { $set: { buckets: conditionalOnApplied ? { $cond: ['$_applied', merged, '$buckets'] } : merged } };
}

function bookkeepingStage({ clientId, now, expireAt }) {
  return { $set: { clientId: { $ifNull: ['$clientId', clientId] }, updatedAt: now, expireAt } };
}

/** Tier 1 rolling (strict, non-hot): the guarded, conditional pipeline — a breach leaves `buckets` untouched. */
export function buildRollingPipeline({ oldestValidBucketLabel, currentBucketLabel, amountDelta, countDelta, thresholdAmount, thresholdCount, clientId, now, expireAt }) {
  return [
    pruneBucketsStage(oldestValidBucketLabel),
    sumStage(),
    appliedGuardStage({ thresholdAmount, thresholdCount, amountDelta, countDelta }),
    mergeCurrentBucketStage({ currentBucketLabel, amountDelta, countDelta, conditionalOnApplied: true }),
    bookkeepingStage({ clientId, now, expireAt }),
  ];
}

/** BRD §4.2.5 "hot dimensions... reverts to Tier-2 soft semantics" — self-pruning still applies, but the increment is unconditional; there is no breach to report from this call. */
export function buildShardedRollingPipeline({ oldestValidBucketLabel, currentBucketLabel, amountDelta, countDelta, clientId, now, expireAt }) {
  return [
    pruneBucketsStage(oldestValidBucketLabel),
    mergeCurrentBucketStage({ currentBucketLabel, amountDelta, countDelta, conditionalOnApplied: false }),
    bookkeepingStage({ clientId, now, expireAt }),
  ];
}
