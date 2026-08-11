import { AppError } from '../utils/AppError.js';
import { scopeEquals } from '../utils/deepEqual.js';
import { findDimension, isWindowEnforced } from './registry.model.js';
import { ALL_LIMIT_WINDOW_TYPES, PER_TXN_WINDOW_TYPE, CURRENCY, REGISTRY_DIMENSION_CODE_PATTERN } from '../constants/index.js';

export const LIMITS_COLLECTION = 'limits';

const VALID_WINDOW_TYPES = new Set(ALL_LIMIT_WINDOW_TYPES);

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateScope(scope, errors) {
  if (scope === undefined || scope === null) {
    return null;
  }
  if (typeof scope !== 'object' || Array.isArray(scope)) {
    errors.push({ field: 'scope', message: 'scope must be an object mapping attribute names to values, or omitted for the wildcard default.' });
    return null;
  }
  const normalized = {};
  for (const [key, value] of Object.entries(scope)) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      errors.push({ field: 'scope', message: `scope.${key} must be a string or number.` });
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

/** BRD §2.3.2 — money is integers in minor units (paise); no floating point anywhere in the threshold path. */
export function validateLimitDefinitionCreate(payload) {
  const errors = [];

  if (typeof payload?.dimensionCode !== 'string' || !REGISTRY_DIMENSION_CODE_PATTERN.test(payload.dimensionCode)) {
    errors.push({ field: 'dimensionCode', message: 'dimensionCode is required and must be 1-64 chars of A-Z, 0-9 or underscore.' });
  }

  if (!VALID_WINDOW_TYPES.has(payload?.windowType)) {
    errors.push({ field: 'windowType', message: `windowType must be one of ${[...VALID_WINDOW_TYPES].join(', ')}.` });
  }

  const scope = validateScope(payload?.scope, errors);

  const hasAmount = payload?.thresholdAmount !== undefined && payload?.thresholdAmount !== null;
  const hasCount = payload?.thresholdCount !== undefined && payload?.thresholdCount !== null;

  if (hasAmount && !isNonNegativeInteger(payload.thresholdAmount)) {
    errors.push({ field: 'thresholdAmount', message: 'thresholdAmount must be a non-negative integer number of paise (no floating point).' });
  }
  if (hasCount && !isNonNegativeInteger(payload.thresholdCount)) {
    errors.push({ field: 'thresholdCount', message: 'thresholdCount must be a non-negative integer.' });
  }
  if (payload?.windowType === PER_TXN_WINDOW_TYPE && hasCount) {
    errors.push({ field: 'thresholdCount', message: 'PER_TXN is amount-only; thresholdCount is not applicable (BRD §2.3 item 1).' });
  }
  if (!hasAmount && !hasCount) {
    errors.push({ field: 'thresholdAmount', message: 'at least one of thresholdAmount or thresholdCount is required.' });
  }

  if (payload?.currency !== undefined && payload.currency !== CURRENCY.INR) {
    errors.push({ field: 'currency', message: `currency must be '${CURRENCY.INR}' in this release (BRD §2.3.2).` });
  }

  let effectiveFrom = payload?.effectiveFrom !== undefined ? new Date(payload.effectiveFrom) : new Date();
  if (Number.isNaN(effectiveFrom.getTime())) {
    errors.push({ field: 'effectiveFrom', message: 'effectiveFrom must be a valid date.' });
  }

  let effectiveTo = null;
  if (payload?.effectiveTo !== undefined && payload.effectiveTo !== null) {
    effectiveTo = new Date(payload.effectiveTo);
    if (Number.isNaN(effectiveTo.getTime())) {
      errors.push({ field: 'effectiveTo', message: 'effectiveTo must be a valid date.' });
    } else if (!Number.isNaN(effectiveFrom.getTime()) && effectiveTo <= effectiveFrom) {
      errors.push({ field: 'effectiveTo', message: 'effectiveTo must be after effectiveFrom.' });
    }
  }

  if (errors.length > 0) {
    throw AppError.badRequest('Limit definition payload failed validation.', 'VALIDATION_ERROR', { errors });
  }

  return {
    dimensionCode: payload.dimensionCode,
    scope,
    windowType: payload.windowType,
    thresholdAmount: hasAmount ? payload.thresholdAmount : null,
    thresholdCount: hasCount ? payload.thresholdCount : null,
    currency: CURRENCY.INR,
    isActive: payload.isActive !== false,
    effectiveFrom,
    effectiveTo,
  };
}

/** dimensionCode, windowType and scope define a definition's identity and are immutable after creation — only thresholds, dates and isActive may change. */
export function validateLimitDefinitionUpdate(payload) {
  const errors = [];
  const update = {};

  for (const immutableField of ['dimensionCode', 'windowType', 'scope']) {
    if (payload?.[immutableField] !== undefined) {
      errors.push({ field: immutableField, message: `${immutableField} is immutable after creation.` });
    }
  }

  if (payload?.thresholdAmount !== undefined) {
    if (payload.thresholdAmount !== null && !isNonNegativeInteger(payload.thresholdAmount)) {
      errors.push({ field: 'thresholdAmount', message: 'thresholdAmount must be a non-negative integer or null.' });
    } else {
      update.thresholdAmount = payload.thresholdAmount;
    }
  }
  if (payload?.thresholdCount !== undefined) {
    if (payload.thresholdCount !== null && !isNonNegativeInteger(payload.thresholdCount)) {
      errors.push({ field: 'thresholdCount', message: 'thresholdCount must be a non-negative integer or null.' });
    } else {
      update.thresholdCount = payload.thresholdCount;
    }
  }
  if (payload?.isActive !== undefined) {
    if (typeof payload.isActive !== 'boolean') {
      errors.push({ field: 'isActive', message: 'isActive must be a boolean.' });
    } else {
      update.isActive = payload.isActive;
    }
  }
  if (payload?.effectiveFrom !== undefined) {
    const effectiveFrom = new Date(payload.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) {
      errors.push({ field: 'effectiveFrom', message: 'effectiveFrom must be a valid date.' });
    } else {
      update.effectiveFrom = effectiveFrom;
    }
  }
  if (payload?.effectiveTo !== undefined) {
    if (payload.effectiveTo === null) {
      update.effectiveTo = null;
    } else {
      const effectiveTo = new Date(payload.effectiveTo);
      if (Number.isNaN(effectiveTo.getTime())) {
        errors.push({ field: 'effectiveTo', message: 'effectiveTo must be a valid date.' });
      } else {
        update.effectiveTo = effectiveTo;
      }
    }
  }

  if (Object.keys(update).length === 0 && errors.length === 0) {
    errors.push({ field: '_', message: 'At least one of thresholdAmount, thresholdCount, isActive, effectiveFrom or effectiveTo must be provided.' });
  }

  if (errors.length > 0) {
    throw AppError.badRequest('Limit definition update payload failed validation.', 'VALIDATION_ERROR', { errors });
  }

  return update;
}

export function buildLimitDefinitionDocument({ clientId, normalized, actor, now }) {
  return {
    clientId,
    ...normalized,
    definitionVersion: 1,
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * STORY-02-05 — a definition can be inert for two distinct reasons (gate
 * closed at the dimension level, or at the window level) plus its own
 * state (inactive / outside its effective window). Registry-gate reasons
 * are checked first since those are what the story's warning must name
 * specifically ("names the window gate specifically, not just the dimension").
 */
export function evaluateEffectiveness(definition, registrySnapshot, now = new Date()) {
  const dimension = findDimension(registrySnapshot, definition.dimensionCode);
  if (!dimension) {
    return {
      effective: false,
      reason: 'DIMENSION_NOT_REGISTERED',
      message: `dimensionCode '${definition.dimensionCode}' is not present in the client's registry. Add it to the registry to activate this definition.`,
    };
  }

  if (definition.windowType !== PER_TXN_WINDOW_TYPE) {
    const windowEntry = dimension.windows[definition.windowType];
    if (!windowEntry) {
      return {
        effective: false,
        reason: 'WINDOW_NOT_DECLARED',
        message: `window '${definition.windowType}' is not declared for dimension '${definition.dimensionCode}'. Declare it in the registry to activate this definition.`,
      };
    }
    if (!isWindowEnforced(windowEntry, now)) {
      return {
        effective: false,
        reason: 'WINDOW_PENDING_ACTIVATION',
        message: `window '${definition.windowType}' for dimension '${definition.dimensionCode}' is declared but not yet active (pending activation at the next window boundary).`,
      };
    }
  }

  if (!definition.isActive) {
    return { effective: false, reason: 'DEFINITION_INACTIVE', message: 'definition is not active.' };
  }
  if (now < definition.effectiveFrom) {
    return {
      effective: false,
      reason: 'NOT_YET_EFFECTIVE_DATE',
      message: `definition becomes effective from ${definition.effectiveFrom.toISOString()}.`,
    };
  }
  if (definition.effectiveTo && now >= definition.effectiveTo) {
    return {
      effective: false,
      reason: 'EFFECTIVE_PERIOD_ENDED',
      message: `definition's effective period ended at ${definition.effectiveTo.toISOString()}.`,
    };
  }

  return { effective: true, reason: null, message: null };
}

/**
 * STORY-02-04 AC2 — a scope override pinned to specific attribute values
 * takes precedence over the wildcard default for the same dimension/window.
 * Pure function over an already-loaded definitions list (the in-process
 * cache, STORY-02-06) — no I/O, so it is safe to call on the hot path.
 */
export function findApplicableDefinition(definitions, dimensionCode, windowType, attributeValues, now = new Date()) {
  const candidates = definitions.filter(
    (def) =>
      def.dimensionCode === dimensionCode &&
      def.windowType === windowType &&
      def.isActive &&
      now >= def.effectiveFrom &&
      (!def.effectiveTo || now < def.effectiveTo),
  );

  const scoped = candidates.find((def) => def.scope && scopeEquals(def.scope, attributeValues));
  if (scoped) {
    return scoped;
  }
  return candidates.find((def) => !def.scope) ?? null;
}
