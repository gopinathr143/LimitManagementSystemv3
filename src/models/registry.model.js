import { AppError } from '../utils/AppError.js';
import { deepFreeze } from '../utils/deepFreeze.js';
import { nextBoundaryFor } from '../utils/windowBoundary.js';
import {
  WINDOW_TYPE,
  WINDOW_STATE,
  KNOWN_TRANSACTION_ATTRIBUTES,
  REGISTRY_DIMENSION_CODE_PATTERN,
  GLOBAL_DIMENSION_CODE,
  ROLLING_GRANULARITY,
} from '../constants/index.js';

export const CLIENT_CONFIGS_COLLECTION = 'clientConfigs';

const VALID_WINDOW_TYPES = new Set(Object.values(WINDOW_TYPE));
const VALID_ATTRIBUTES = new Set(KNOWN_TRANSACTION_ATTRIBUTES);
const VALID_GRANULARITIES = new Set(Object.values(ROLLING_GRANULARITY));

/**
 * BRD §4.3.1 — accepts either the canonical map form or the equivalent
 * plain-array shorthand and normalises to the map. `null`/`undefined`
 * becomes an empty map (caught by the "at least one window" rule below,
 * with a clearer error than a missing-property one would give).
 */
function toWindowsMap(windows) {
  if (windows === undefined || windows === null) {
    return {};
  }
  if (Array.isArray(windows)) {
    const map = {};
    for (const windowType of windows) {
      map[windowType] = {};
    }
    return map;
  }
  if (typeof windows === 'object') {
    return { ...windows };
  }
  return { __invalid__: windows };
}

/**
 * Carries forward activation timing for a window that already existed in
 * the previous registry version; computes fresh timing for a newly
 * declared one. This is what makes STORY-02-03's boundary-alignment rule
 * (and its WARMING opt-in) survive an unrelated registry edit — a client
 * updating one dimension's shardFactor must not reset every other
 * dimension's already-in-flight activation clock.
 */
function resolveActivationTiming({ windowType, override, previousWindowEntry, timezone, now }) {
  if (previousWindowEntry) {
    // Already declared before — carry the original activation clock forward untouched.
    return {
      declaredAt: previousWindowEntry.declaredAt,
      boundaryAt: previousWindowEntry.boundaryAt,
      warming: previousWindowEntry.warming,
    };
  }
  const warming = override?.warming === true;
  const declaredAt = now;
  const boundaryAt = nextBoundaryFor(windowType, timezone, now);
  return { declaredAt, boundaryAt, warming };
}

function validateWindowOverride(dimensionCode, windowType, rawOverride, errors) {
  if (rawOverride === undefined || rawOverride === null) {
    return {};
  }
  if (typeof rawOverride !== 'object' || Array.isArray(rawOverride)) {
    errors.push({ dimensionCode, windowType, field: 'windows', message: 'window override must be an object.' });
    return {};
  }

  const { granularity, shardFactor, warming } = rawOverride;
  const result = {};

  if (granularity !== undefined) {
    if (windowType !== WINDOW_TYPE.DAILY_ROLLING) {
      errors.push({
        dimensionCode,
        windowType,
        field: 'granularity',
        message: 'granularity is only valid on DAILY_ROLLING.',
      });
    } else if (!VALID_GRANULARITIES.has(granularity)) {
      errors.push({
        dimensionCode,
        windowType,
        field: 'granularity',
        message: `granularity must be one of ${[...VALID_GRANULARITIES].join(', ')}.`,
      });
    } else {
      result.granularity = granularity;
    }
  }

  if (shardFactor !== undefined) {
    if (!Number.isInteger(shardFactor) || shardFactor < 2) {
      errors.push({
        dimensionCode,
        windowType,
        field: 'shardFactor',
        message: 'shardFactor override must be an integer >= 2.',
      });
    } else {
      result.shardFactor = shardFactor;
    }
  }

  if (warming !== undefined && typeof warming !== 'boolean') {
    errors.push({ dimensionCode, windowType, field: 'warming', message: 'warming must be a boolean.' });
  }

  return result;
}

function validateDimension(rawDimension, { previousDimension, timezone, now, errors }) {
  const dimensionCode = rawDimension?.code;

  if (typeof dimensionCode !== 'string' || !REGISTRY_DIMENSION_CODE_PATTERN.test(dimensionCode)) {
    errors.push({ dimensionCode: String(dimensionCode), field: 'code', message: 'code must be 1-64 chars of A-Z, 0-9 or underscore.' });
    return null;
  }

  const attributes = Array.isArray(rawDimension.attributes) ? rawDimension.attributes : [];
  for (const attribute of attributes) {
    if (!VALID_ATTRIBUTES.has(attribute)) {
      errors.push({
        dimensionCode,
        field: 'attributes',
        message: `attribute '${attribute}' is not one the engine can extract. Known attributes: ${KNOWN_TRANSACTION_ATTRIBUTES.join(', ')}.`,
      });
    }
  }

  const hot = rawDimension.hot === true;
  let shardFactor;
  if (hot) {
    if (!Number.isInteger(rawDimension.shardFactor) || rawDimension.shardFactor < 2) {
      errors.push({ dimensionCode, field: 'shardFactor', message: 'shardFactor is required and must be an integer >= 2 when hot is true.' });
    } else {
      shardFactor = rawDimension.shardFactor;
    }
  }

  const rawWindowsMap = toWindowsMap(rawDimension.windows);
  if (rawWindowsMap.__invalid__ !== undefined) {
    errors.push({ dimensionCode, field: 'windows', message: 'windows must be an array of window types or a map keyed by window type.' });
    return null;
  }

  const windowTypes = Object.keys(rawWindowsMap);
  if (windowTypes.length === 0) {
    errors.push({ dimensionCode, field: 'windows', message: 'a dimension must declare at least one window.' });
  }

  const windows = {};
  for (const windowType of windowTypes) {
    if (windowType === 'PER_TXN') {
      errors.push({
        dimensionCode,
        windowType,
        field: 'windows',
        message: 'PER_TXN is implicit for every dimension and must never be declared in windows.',
      });
      continue;
    }
    if (!VALID_WINDOW_TYPES.has(windowType)) {
      errors.push({ dimensionCode, windowType, field: 'windows', message: `unknown window type '${windowType}'.` });
      continue;
    }

    const validatedOverride = validateWindowOverride(dimensionCode, windowType, rawWindowsMap[windowType], errors);
    const previousWindowEntry = previousDimension?.windows?.[windowType];
    const timing = resolveActivationTiming({ windowType, override: rawWindowsMap[windowType], previousWindowEntry, timezone, now });

    windows[windowType] = { ...validatedOverride, ...timing };
  }

  return { code: dimensionCode, attributes: [...attributes], hot, shardFactor, windows };
}

/**
 * BRD §4.3 "Snapshot consistency" — validates a full registry submission
 * and returns the normalised, frozen document ready to persist. Throws a
 * single AppError carrying every violation found (not just the first) so a
 * reviewer sees the whole picture in one round trip.
 */
export function validateAndNormalizeRegistry(allowedDimensions, { previousRegistry, timezone, now = new Date() }) {
  const errors = [];

  if (!Array.isArray(allowedDimensions) || allowedDimensions.length === 0) {
    throw AppError.badRequest('allowedDimensions must be a non-empty array.', 'VALIDATION_ERROR', {
      errors: [{ field: 'allowedDimensions', message: 'must be a non-empty array.' }],
    });
  }

  const previousByCode = new Map((previousRegistry?.allowedDimensions ?? []).map((dim) => [dim.code, dim]));
  const seenCodes = new Set();
  const normalized = [];

  for (const rawDimension of allowedDimensions) {
    const code = rawDimension?.code;
    if (typeof code === 'string' && seenCodes.has(code)) {
      errors.push({ dimensionCode: code, field: 'code', message: 'duplicate dimensionCode in the same registry.' });
      continue;
    }
    if (typeof code === 'string') {
      seenCodes.add(code);
    }

    const dimension = validateDimension(rawDimension, {
      previousDimension: previousByCode.get(code),
      timezone,
      now,
      errors,
    });
    if (dimension) {
      normalized.push(dimension);
    }
  }

  if (!seenCodes.has(GLOBAL_DIMENSION_CODE)) {
    errors.push({ field: 'allowedDimensions', message: `registry must include the mandatory '${GLOBAL_DIMENSION_CODE}' dimension.` });
  }

  if (errors.length > 0) {
    throw AppError.badRequest('Registry failed validation.', 'REGISTRY_VALIDATION_ERROR', { errors });
  }

  return normalized;
}

/** BRD §4.3.2 — derived, never stored as a fixed value; recomputing from `now` is what lets a boundary crossing take effect with no write. */
export function deriveWindowState(windowEntry, now = new Date()) {
  const boundaryPassed = now >= windowEntry.boundaryAt;
  if (windowEntry.warming) {
    return boundaryPassed ? WINDOW_STATE.ACTIVE : WINDOW_STATE.WARMING;
  }
  return boundaryPassed ? WINDOW_STATE.ACTIVE : WINDOW_STATE.PENDING_ACTIVATION;
}

export function isWindowEnforced(windowEntry, now = new Date()) {
  const state = deriveWindowState(windowEntry, now);
  return state === WINDOW_STATE.ACTIVE || state === WINDOW_STATE.WARMING;
}

export function findDimension(registrySnapshot, dimensionCode) {
  return registrySnapshot?.allowedDimensions?.find((dim) => dim.code === dimensionCode) ?? null;
}

export function buildRegistryDocument({ clientId, allowedDimensions, configVersion, limitsVersion, actor, now }) {
  return {
    _id: clientId,
    clientId,
    configVersion,
    limitsVersion,
    allowedDimensions,
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
  };
}

export function freezeRegistry(registryDoc) {
  return deepFreeze(structuredClone(registryDoc));
}
