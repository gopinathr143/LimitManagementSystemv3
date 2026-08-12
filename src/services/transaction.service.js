import { randomUUID } from 'node:crypto';
import { validateTransactionRequest, buildClaimDocument, extractAttributeMap, attributeMapToOrderedValues } from '../models/transaction.model.js';
import { deriveWindowState, isWindowEnforced, findDimension } from '../models/registry.model.js';
import { findApplicableDefinition } from '../models/limitDefinition.model.js';
import { TRANSACTION_STATUS, TERMINAL_TRANSACTION_STATUSES, WINDOW_TYPE, WINDOW_STATE, DIRECTION } from '../constants/index.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';

const DAILY_WINDOWS_THEN_MONTHLY = [WINDOW_TYPE.DAILY_CALENDAR, WINDOW_TYPE.DAILY_ROLLING, WINDOW_TYPE.MONTHLY];

/**
 * BRD §2.4 / §3.1 / §3.3 — the request path. Claims the transaction before
 * any validation or counter access (STORY-04-01, the v4 double-count
 * defect fix), then runs the config-driven waterfall across the client's
 * declared dimensions in order (STORY-04-03), compensating everything
 * applied so far on the first breach (STORY-04-04's saga).
 *
 * STORY-08-01/08-02 — `direction` is threaded through every step: it is
 * validated before the claim is even attempted (fail-closed, never
 * defaulted), it is part of the claim's compound `_id` (an outward and an
 * inward transaction with the identical transactionId claim genuinely
 * separate mutexes), and it selects which direction's registry/definitions
 * the waterfall evaluates against.
 */
export class TransactionService {
  constructor(transactionRepository, configCache, counterEngineService, options = {}) {
    this.transactionRepository = transactionRepository;
    this.configCache = configCache;
    this.counterEngineService = counterEngineService;
    this.instanceId = options.instanceId ?? randomUUID();
    // BRD §3.5 — optional so EPIC-04 (built before the sweeper existed) keeps working unwired; when present, every
    // floor-guard failure (saga rollback or reversal) is queued for targeted reconciliation, not just logged.
    this.reconciliationService = options.reconciliationService ?? null;
    // BRD §4.11 — optional so every existing caller keeps working unwired.
    this.metricsService = options.metricsService ?? null;
    // BRD §4.7 — optional; when present, getStatus() falls back to the cold tier once a record has aged out of the hot collection.
    this.transactionArchiveRepository = options.transactionArchiveRepository ?? null;
  }

  /**
   * BRD §3.1 — the mutex. `timezone` is the client's (already resolved by
   * `resolveClientId` middleware — no extra lookup here). `enabledDirections`
   * is the client's own enabled-direction set (also resolved by that same
   * middleware) — STORY-08-01 AC3: a direction can be structurally valid and
   * still rejected if this specific client hasn't had it enabled. Returns a
   * uniform `{httpStatus, body}`.
   */
  async submit(clientId, payload, timezone, enabledDirections = [], now = new Date()) {
    const startedAt = process.hrtime.bigint();
    const { direction, transactionId, amount, attributes } = validateTransactionRequest(payload);

    if (!enabledDirections.includes(direction)) {
      logger.warn({ clientId, direction }, 'Transaction rejected: direction not enabled for this client');
      return {
        httpStatus: 403,
        body: { success: false, error: { code: 'DIRECTION_NOT_ENABLED', message: `Direction '${direction}' is not enabled for client '${clientId}'.` } },
      };
    }

    const claimDoc = buildClaimDocument({ clientId, direction, transactionId, requestData: { amount, ...attributes }, now, instanceId: this.instanceId });
    const claim = await this.transactionRepository.claim(clientId, claimDoc);

    if (!claim.claimed) {
      return this.#responseForExisting(claim.existing);
    }

    logger.info({ clientId, direction, transactionId }, 'Transaction claimed');

    const outcome = await this.#runWaterfall(clientId, { direction, transactionId, amount, attributes }, timezone, now);

    const resolveFields = this.#buildResolveFields(outcome, now);
    let resolveResult;
    try {
      resolveResult = await this.transactionRepository.resolve(clientId, direction, transactionId, resolveFields);
    } catch (error) {
      // BRD §3.3 step 5 — the resolve write itself failed after retries: compensate everything applied and fail closed.
      await this.#compensateAll(clientId, outcome.appliedCounterKeys ?? [], transactionId);
      await this.transactionRepository
        .resolve(clientId, direction, transactionId, { status: TRANSACTION_STATUS.SYSTEM_FAILURE, updatedAt: now, resolvedAt: now })
        .catch((innerError) => logger.error({ err: innerError, clientId, direction, transactionId }, 'Best-effort SYSTEM_FAILURE resolve also failed'));
      logger.error({ err: error, clientId, direction, transactionId }, 'Resolve write failed after retries; compensated and marked SYSTEM_FAILURE');
      this.metricsService?.recordError(clientId, 'SYSTEM_FAILURE');
      this.#observeRequestLatency(startedAt);
      return { httpStatus: 500, body: { success: false, error: { code: 'SYSTEM_FAILURE', message: 'Unable to resolve transaction outcome.' } } };
    }

    if (resolveResult.matchedCount === 0) {
      logger.warn({ clientId, direction, transactionId }, 'Resolve matched no PENDING claim — already resolved by another path');
    }

    this.metricsService?.recordDecision(clientId, outcome.status);
    this.#observeRequestLatency(startedAt);
    return { httpStatus: 200, body: { success: true, data: this.#toResponseData(transactionId, outcome) } };
  }

  #observeRequestLatency(startedAtNs) {
    if (!this.metricsService) {
      return;
    }
    const elapsedSeconds = Number(process.hrtime.bigint() - startedAtNs) / 1e9;
    this.metricsService.observeRequestLatency(elapsedSeconds);
  }

  /**
   * BRD §3.2 AC3 — retrievable by the compound (clientId, direction,
   * transactionId) key, for status lookup and reversal. BRD §4.7 AC2 — once
   * a record has aged out of the hot collection, the SAME lookup must still
   * resolve it from the archive, so a consumer never needs to know which
   * tier a record currently lives in.
   */
  async getStatus(clientId, direction, transactionId) {
    // BRD §2.1.6 "API consequence" — status lookups carry the same single-direction-period leniency as reversal.
    const resolvedDirection = direction ?? DIRECTION.OUTWARD;
    const doc = await this.transactionRepository.findByTransactionId(clientId, resolvedDirection, transactionId);
    if (doc) {
      return this.#toResponseData(transactionId, doc);
    }
    if (this.transactionArchiveRepository) {
      const archived = await this.transactionArchiveRepository.findByTransactionId(clientId, resolvedDirection, transactionId);
      if (archived) {
        return this.#toResponseData(transactionId, archived);
      }
    }
    throw AppError.notFound(`Transaction '${transactionId}' not found for client '${clientId}' direction '${resolvedDirection}'.`, 'TRANSACTION_NOT_FOUND');
  }

  /**
   * BRD §3.4 — reverse an approved transaction. Ordering per the BRD: the
   * status flip is attempted FIRST (`reverseIfApproved`'s guarded
   * `findOneAndUpdate`), and only when it actually matched are any counters
   * touched — this is what makes two concurrent reversal calls resolve to
   * exactly one of them decrementing anything (AC3). A flip that doesn't
   * match is not necessarily an error: it's the same idempotent-replay shape
   * used by `submit()` for `AC2`, applied to reversal instead of approval.
   *
   * STORY-08-02 notes — "during the single-direction period the reversal API
   * may default a missing direction to outward... withdrawn as an announced
   * step when a second direction is enabled, not silently." That leniency is
   * implemented here (and ONLY here — submit() never defaults, per
   * STORY-08-01 AC1) and is a single, obvious line to delete when it's time.
   */
  async reverseTransaction(clientId, direction, transactionId, reason, now = new Date()) {
    const resolvedDirection = direction ?? DIRECTION.OUTWARD;
    const flipped = await this.transactionRepository.reverseIfApproved(clientId, resolvedDirection, transactionId, { reason, now });

    if (!flipped) {
      const existing = await this.transactionRepository.findByTransactionId(clientId, resolvedDirection, transactionId);
      if (!existing) {
        throw AppError.notFound(`Transaction '${transactionId}' not found for client '${clientId}' direction '${resolvedDirection}'.`, 'TRANSACTION_NOT_FOUND');
      }
      if (existing.status === TRANSACTION_STATUS.REVERSED) {
        // AC2 — a repeated reversal call is a no-op, not an error; no counter is touched a second time.
        return { httpStatus: 200, body: { success: true, data: { transactionId, status: TRANSACTION_STATUS.REVERSED, alreadyReversed: true } } };
      }
      return {
        httpStatus: 409,
        body: {
          success: false,
          error: {
            code: 'TRANSACTION_NOT_REVERSIBLE',
            message: `Transaction '${transactionId}' has status '${existing.status}'; only an APPROVED transaction can be reversed.`,
          },
        },
      };
    }

    logger.info({ clientId, direction: resolvedDirection, transactionId }, 'Transaction reversal claimed; decrementing applied counters');
    const registry = this.configCache.getRegistry(clientId, resolvedDirection);
    const reversedCounters = await this.#reverseAppliedKeys(clientId, transactionId, flipped.appliedCounterKeys ?? [], registry, now);

    return { httpStatus: 200, body: { success: true, data: { transactionId, status: TRANSACTION_STATUS.REVERSED, reversedCounters } } };
  }

  /**
   * BRD §3.4 step 2 — for each recorded key: skip (no-op, logged) if the
   * dimension or that window was de-activated in the registry since
   * approval (AC5); otherwise decrement the exact recorded document/bucket
   * via the SAME compensation primitive the saga rollback uses (STORY-04-04
   * — reversal is a second consumer of that already-proven contract, per
   * STORY-04-05's notes). A failed floor guard (AC6) is a drift signal, not
   * a silently swallowed failure.
   */
  async #reverseAppliedKeys(clientId, transactionId, appliedKeys, registry, now) {
    const results = [];
    for (let i = appliedKeys.length - 1; i >= 0; i -= 1) {
      const applied = appliedKeys[i];
      if (!this.#isCounterKeyGoverned(registry, applied.dimensionCode, applied.windowType)) {
        logger.info(
          { clientId, transactionId, appliedKey: applied.key, dimensionCode: applied.dimensionCode, windowType: applied.windowType },
          'Reversal skipped: dimension/window no longer governed by the registry',
        );
        results.push({ key: applied.key, skipped: true, reason: 'NOT_GOVERNED' });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const result = await this.#compensateOne(clientId, applied);
      if (!result.floorGuardHeld) {
        logger.error({ clientId, transactionId, appliedKey: applied.key, tier: applied.tier }, 'Reversal floor guard failed — drift signal for reconciliation');
        this.metricsService?.recordFloorGuardFailure(clientId, applied.tier, 'REVERSAL');
        // eslint-disable-next-line no-await-in-loop
        await this.#queueDrift(clientId, transactionId, applied, 'REVERSAL_FLOOR_GUARD_FAILED');
      }
      results.push({ key: applied.key, skipped: false, floorGuardHeld: result.floorGuardHeld });
    }
    return results;
  }

  /** BRD §3.4 step 2 — governed means the dimension is still in the registry AND still declares this window; either being removed means the counter is no longer runtime-governed and reversal must not touch it (§4.4 "de-activation... reversal skips them"). */
  #isCounterKeyGoverned(registry, dimensionCode, windowType) {
    const dimension = findDimension(registry, dimensionCode);
    if (!dimension) {
      return false;
    }
    return Boolean(dimension.windows?.[windowType]);
  }

  async #queueDrift(clientId, transactionId, applied, reason) {
    if (!this.reconciliationService) {
      return;
    }
    try {
      await this.reconciliationService.queueDrift(clientId, { ...applied, sourceTransactionId: transactionId, reason });
    } catch (error) {
      logger.error({ err: error, clientId, transactionId, appliedKey: applied.key }, 'Failed to queue drift signal for reconciliation');
    }
  }

  #responseForExisting(existing) {
    if (!existing || existing.status === TRANSACTION_STATUS.PENDING) {
      this.metricsService?.recordInProgress(existing?.clientId ?? 'UNKNOWN');
      return { httpStatus: 409, body: { success: false, error: { code: 'TRANSACTION_IN_PROGRESS', message: 'Transaction is being processed; retry shortly.' } } };
    }
    if (TERMINAL_TRANSACTION_STATUSES.includes(existing.status)) {
      // BRD §3.1 step 3 — the stored result, returned verbatim. No re-validation, no counter access.
      return { httpStatus: 200, body: { success: true, data: this.#toResponseData(existing.transactionId, existing) } };
    }
    return { httpStatus: 500, body: { success: false, error: { code: 'UNKNOWN_TRANSACTION_STATE', message: `Unexpected status '${existing.status}'.` } } };
  }

  #toResponseData(transactionId, source) {
    const data = { transactionId, status: source.status };
    if (source.direction) {
      data.direction = source.direction;
    }
    if (source.rejection) {
      data.rejection = source.rejection;
    }
    if (source.appliedCounterKeys) {
      data.appliedCounterKeys = source.appliedCounterKeys;
    }
    if (source.windowState) {
      data.windowState = source.windowState;
    }
    return data;
  }

  #buildResolveFields(outcome, now) {
    const fields = { status: outcome.status, updatedAt: now, resolvedAt: now };
    if (outcome.appliedCounterKeys) {
      fields.appliedCounterKeys = outcome.appliedCounterKeys;
    }
    if (outcome.rejection) {
      fields.rejection = outcome.rejection;
    }
    if (outcome.windowState) {
      fields.windowState = outcome.windowState;
    }
    return fields;
  }

  /**
   * BRD §2.4 / §3.3 — the waterfall itself. Iterates the client's declared
   * dimensions in registry order; for each, checks the implicit PER_TXN
   * cap then every window it declares, in the fixed order
   * Per-Txn → Daily Calendar → Daily Rolling → Monthly. Stops on the first
   * breach and compensates everything applied so far, in reverse order.
   * STORY-08-01 AC4 / STORY-08-03 — `direction` selects which direction's
   * registry and definitions this evaluates against; a client with no
   * registry configured for this direction fails closed exactly like a
   * client with no registry at all did before EPIC-08.
   */
  async #runWaterfall(clientId, { direction, transactionId, amount, attributes }, timezone, now) {
    const registry = this.configCache.getRegistry(clientId, direction);
    if (!registry) {
      return { status: TRANSACTION_STATUS.REJECTED, rejection: { reason: 'REGISTRY_MISSING', message: `Client '${clientId}' has no registry for direction '${direction}'; failing closed.` } };
    }

    const appliedKeys = [];
    let anyWarming = false;

    for (const dimension of registry.allowedDimensions) {
      const attributeMap = extractAttributeMap(dimension.attributes, attributes);
      if (attributeMap === null) {
        continue; // BRD §2.4 step 3.1 — required attribute absent, dimension not applicable.
      }

      const perTxnResult = this.counterEngineService.checkPerTransaction(clientId, { direction, dimensionCode: dimension.code, attributeMap, txnAmount: amount, now });
      if (!perTxnResult.passed) {
        await this.#compensateAll(clientId, appliedKeys, transactionId);
        const rejection = {
          dimensionCode: dimension.code,
          windowType: 'PER_TXN',
          metrics: ['AMOUNT'],
          thresholdAmount: perTxnResult.breach?.threshold ?? null,
          definitionVersion: perTxnResult.definitionVersion ?? null,
          currentAmount: amount,
          currentCount: null,
          reason: perTxnResult.reason,
        };
        this.metricsService?.recordRejection(clientId, rejection);
        return { status: TRANSACTION_STATUS.REJECTED, rejection };
      }

      const orderedValues = attributeMapToOrderedValues(dimension.attributes, attributeMap);

      for (const windowType of DAILY_WINDOWS_THEN_MONTHLY) {
        const windowEntry = dimension.windows[windowType];
        if (!windowEntry) {
          continue; // not declared for this dimension
        }
        if (!isWindowEnforced(windowEntry, now)) {
          continue; // PENDING_ACTIVATION — not enforced until its boundary (§4.3.2)
        }
        const warming = deriveWindowState(windowEntry, now) === WINDOW_STATE.WARMING;
        anyWarming = anyWarming || warming;

        const definitions = this.configCache.getDefinitions(clientId, direction) ?? [];
        const definition = findApplicableDefinition(definitions, direction, dimension.code, windowType, attributeMap, now);
        if (!definition) {
          continue; // Undeclared threshold = Unlimited (§2.3)
        }

        // eslint-disable-next-line no-await-in-loop
        const result = await this.#checkAndIncrement({ clientId, direction, dimension, windowType, windowEntry, orderedValues, timezone, amount, definition, now });

        if (!result.passed) {
          // eslint-disable-next-line no-await-in-loop
          await this.#compensateAll(clientId, appliedKeys, transactionId);
          const rejection = {
            dimensionCode: dimension.code,
            windowType,
            metrics: result.breach.metrics ?? [],
            thresholdAmount: result.breach.thresholdAmount,
            thresholdCount: result.breach.thresholdCount,
            definitionVersion: definition.definitionVersion,
            currentAmount: result.breach.currentAmount,
            currentCount: result.breach.currentCount,
          };
          this.metricsService?.recordRejection(clientId, rejection);
          return { status: TRANSACTION_STATUS.REJECTED, rejection, windowState: warming ? WINDOW_STATE.WARMING : undefined };
        }

        appliedKeys.push({
          tier: this.#tierFor(dimension, windowType),
          dimensionCode: dimension.code,
          windowType,
          attributeValues: orderedValues,
          key: result.appliedKey,
          amountDelta: result.amountDelta,
          countDelta: result.countDelta,
          warming,
          // Only present where meaningful (sharded/rolling) — omitted rather than stored as null noise.
          ...(result.bucketLabel !== undefined && { bucketLabel: result.bucketLabel }),
          ...(result.shardIndex !== undefined && { shardIndex: result.shardIndex }),
          ...(result.shardFactorUsed !== undefined && { shardFactorUsed: result.shardFactorUsed }),
        });
      }
    }

    return {
      status: TRANSACTION_STATUS.APPROVED,
      direction,
      appliedCounterKeys: appliedKeys,
      windowState: anyWarming ? WINDOW_STATE.WARMING : undefined,
    };
  }

  #tierFor(dimension, windowType) {
    if (windowType === WINDOW_TYPE.DAILY_ROLLING) {
      return dimension.hot ? 'rolling-sharded' : 'rolling';
    }
    return dimension.hot ? 'tier2' : 'tier1';
  }

  async #checkAndIncrement({ clientId, direction, dimension, windowType, windowEntry, orderedValues, timezone, amount, definition, now }) {
    const common = { thresholdAmount: definition.thresholdAmount, thresholdCount: definition.thresholdCount, txnAmount: amount, now };
    const tier = this.#tierFor(dimension, windowType);
    const startedAt = this.metricsService ? process.hrtime.bigint() : null;

    let result;
    if (windowType === WINDOW_TYPE.DAILY_ROLLING) {
      const granularity = windowEntry.granularity;
      result = dimension.hot
        ? await this.counterEngineService.checkAndIncrementRollingSharded(clientId, { direction, dimensionCode: dimension.code, attributeValues: orderedValues, windowEntry, granularity, ...common })
        : await this.counterEngineService.checkAndIncrementRolling(clientId, { direction, dimensionCode: dimension.code, attributeValues: orderedValues, granularity, ...common });
    } else if (dimension.hot) {
      result = await this.counterEngineService.checkAndIncrementTier2(clientId, { direction, dimensionCode: dimension.code, windowType, attributeValues: orderedValues, timezone, windowEntry, ...common });
    } else {
      result = await this.counterEngineService.checkAndIncrementTier1(clientId, { direction, dimensionCode: dimension.code, windowType, attributeValues: orderedValues, timezone, ...common });
    }

    if (startedAt !== null) {
      this.metricsService.observeTierLatency(tier, Number(process.hrtime.bigint() - startedAt) / 1e9);
    }
    return result;
  }

  /** BRD §3.3 step 3 — compensate in reverse order. A compensation that fails (floor guard) is logged as a drift signal and queued for reconciliation, never silently dropped (§3.4/§3.5). */
  async #compensateAll(clientId, appliedKeys, transactionId) {
    for (let i = appliedKeys.length - 1; i >= 0; i -= 1) {
      const applied = appliedKeys[i];
      // eslint-disable-next-line no-await-in-loop
      const result = await this.#compensateOne(clientId, applied);
      if (!result.floorGuardHeld) {
        logger.error({ clientId, appliedKey: applied.key, tier: applied.tier }, 'Compensation floor guard failed — drift signal for reconciliation');
        this.metricsService?.recordFloorGuardFailure(clientId, applied.tier, 'COMPENSATION');
        // eslint-disable-next-line no-await-in-loop
        await this.#queueDrift(clientId, transactionId, applied, 'COMPENSATION_FLOOR_GUARD_FAILED');
      }
    }
  }

  async #compensateOne(clientId, applied) {
    if (applied.tier === 'rolling' || applied.tier === 'rolling-sharded') {
      return this.counterEngineService.compensateRolling(clientId, applied.key, { bucketLabel: applied.bucketLabel, amountDelta: applied.amountDelta, countDelta: applied.countDelta });
    }
    return this.counterEngineService.compensateTier1(clientId, applied.key, { amountDelta: applied.amountDelta, countDelta: applied.countDelta });
  }
}
