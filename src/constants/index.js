export const CLIENT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
});

/**
 * BRD §2.1.5/§2.1.6 — direction is a second, mandatory scoping axis alongside
 * clientId. Unlike clientId it cannot be derived from anything trusted server
 * side (the same client submits both directions over the same credential),
 * so it must come from the request payload and is never defaulted.
 */
export const DIRECTION = Object.freeze({
  OUTWARD: 'OUTWARD',
  INWARD: 'INWARD',
});

export const ALL_DIRECTIONS = Object.freeze(Object.values(DIRECTION));

/** BRD §2.1.7 — a COMBINED dimension's counter key carries this neutral segment instead of a specific direction, since the counter is shared across both. Not yet built (STORY-08-04, deliberately deferred — see EPIC-08 docs). Reserved here so the segment value is defined in one place when that story is picked up. */
export const COMBINED_DIRECTION_SEGMENT = 'ALL';

export const AUDIT_RESOURCE = Object.freeze({
  CLIENT: 'CLIENT',
  REGISTRY: 'REGISTRY',
  LIMIT_DEFINITION: 'LIMIT_DEFINITION',
});

export const AUDIT_ACTION = Object.freeze({
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_STATUS_CHANGED: 'CLIENT_STATUS_CHANGED',
  CLIENT_TIMEZONE_CHANGED: 'CLIENT_TIMEZONE_CHANGED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  REGISTRY_CREATED: 'REGISTRY_CREATED',
  REGISTRY_UPDATED: 'REGISTRY_UPDATED',
  LIMIT_DEFINITION_CREATED: 'LIMIT_DEFINITION_CREATED',
  LIMIT_DEFINITION_UPDATED: 'LIMIT_DEFINITION_UPDATED',
  LIMIT_DEFINITION_DEACTIVATED: 'LIMIT_DEFINITION_DEACTIVATED',
});

/** BRD §2.2 — every enabled client must carry this dimension with a mandatory Per-Transaction limit (§5). */
export const GLOBAL_DIMENSION_CODE = 'GLOBAL';

/** BRD §2.3 — the three windows a dimension can *declare* in its registry (§4.3.1). PER_TXN is implicit and never declared (§2.3 "Per-Transaction is never gated"). */
export const WINDOW_TYPE = Object.freeze({
  DAILY_CALENDAR: 'DAILY_CALENDAR',
  DAILY_ROLLING: 'DAILY_ROLLING',
  MONTHLY: 'MONTHLY',
});

/** BRD §2.3 item 1 — stateless, implicitly enabled for every dimension, never listed in `windows`. Only appears as a `limits.windowType` value. */
export const PER_TXN_WINDOW_TYPE = 'PER_TXN';

/** Every windowType a limit definition may target — the declarable three, plus the implicit PER_TXN. */
export const ALL_LIMIT_WINDOW_TYPES = Object.freeze([PER_TXN_WINDOW_TYPE, ...Object.values(WINDOW_TYPE)]);

/** BRD §4.2.5 — DAILY_ROLLING sub-bucket precision; HOUR is the default, MINUTE for tightly-controlled dimensions. */
export const ROLLING_GRANULARITY = Object.freeze({
  HOUR: 'HOUR',
  MINUTE: 'MINUTE',
});

/** BRD §4.3.2 — a window's enforcement state, derived from `effectiveAt`/`warming`, never stored as a fixed value (see registry.model.js). */
export const WINDOW_STATE = Object.freeze({
  PENDING_ACTIVATION: 'PENDING_ACTIVATION',
  ACTIVE: 'ACTIVE',
  WARMING: 'WARMING',
});

/**
 * BRD §2.2 — the transaction attributes the engine can extract, for the
 * OUTWARD registry illustrated in the BRD. This is necessarily a stand-in
 * ahead of EPIC-04's real transaction schema; registry validation rejects
 * any dimension attribute outside this set (STORY-02-01 AC3) so a config
 * naming an attribute the engine cannot extract fails fast at write time
 * rather than silently going unenforced at request time.
 */
export const KNOWN_TRANSACTION_ATTRIBUTES = Object.freeze(['channel', 'ucic', 'accountNumber', 'mcc']);

/** BRD §2.3.2 — IMPS is INR-only in this release; the field is reserved for future multi-currency clients. */
export const CURRENCY = Object.freeze({
  INR: 'INR',
});

export const REGISTRY_DIMENSION_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

/** BRD §3.1/§3.2 — the transaction claim's lifecycle. Never deleted, only transitioned (STORY-04-02 AC4). */
export const TRANSACTION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVERSED: 'REVERSED',
  ABANDONED: 'ABANDONED',
  SYSTEM_FAILURE: 'SYSTEM_FAILURE',
});

/** A status the claim can never leave — the terminal/resolved states a duplicate submission's response is drawn from verbatim (BRD §3.1 step 3). */
export const TERMINAL_TRANSACTION_STATUSES = Object.freeze([
  TRANSACTION_STATUS.APPROVED,
  TRANSACTION_STATUS.REJECTED,
  TRANSACTION_STATUS.REVERSED,
  TRANSACTION_STATUS.ABANDONED,
  TRANSACTION_STATUS.SYSTEM_FAILURE,
]);
