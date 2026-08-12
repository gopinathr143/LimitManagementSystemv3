import { AppError } from '../utils/AppError.js';
import { KNOWN_TRANSACTION_ATTRIBUTES, TRANSACTION_STATUS, ALL_DIRECTIONS } from '../constants/index.js';

export const TRANSACTIONS_COLLECTION = 'transactions';

/**
 * BRD §4.7 — the cold tier. The BRD's own wording ("a separate archival
 * cluster or object storage in a columnar format") describes genuinely
 * different infrastructure from the hot MongoDB replica set; provisioning
 * that is a deployment-time decision outside this codebase's reach. This
 * collection demonstrates the correct MECHANISM (copy-then-delete,
 * retrievable by the same compound key) that any real cold-store target
 * would need — see STORY-06-01's notes for the recorded scope boundary.
 */
export const TRANSACTIONS_ARCHIVE_COLLECTION = 'transactionsArchive';

const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * BRD §2.1.6 / STORY-08-01 AC1/AC2 — direction cannot be derived from
 * anything trusted server side (the same client submits both directions
 * over the same credential, unlike clientId), so it must come from the
 * payload and is checked FIRST, before any other validation or counter
 * access, and is never defaulted. Deliberately a distinct error from the
 * generic payload VALIDATION_ERROR below so "direction missing" and
 * "direction unrecognised" are each individually distinguishable, per AC2's
 * "a clear error naming the accepted values."
 */
function assertDirectionPresentAndRecognized(payload) {
  if (payload?.direction === undefined || payload?.direction === null) {
    throw AppError.badRequest('direction is required and is never defaulted to OUTWARD (BRD §2.1.6).', 'DIRECTION_REQUIRED');
  }
  if (!ALL_DIRECTIONS.includes(payload.direction)) {
    throw AppError.badRequest(`direction must be one of ${ALL_DIRECTIONS.join(', ')}, got: '${payload.direction}'.`, 'DIRECTION_UNRECOGNIZED');
  }
}

/**
 * BRD §3.2 "Request Data: Transaction ID, UCIC, Account Number, Amount,
 * Channel, MCC, Timestamp." `amount` is validated the same way limit
 * thresholds are (§2.3.2) — integer paise, no floating point.
 */
export function validateTransactionRequest(payload) {
  assertDirectionPresentAndRecognized(payload);

  const errors = [];

  if (typeof payload?.transactionId !== 'string' || !TRANSACTION_ID_PATTERN.test(payload.transactionId)) {
    errors.push({ field: 'transactionId', message: 'transactionId is required (1-128 chars, alphanumeric/underscore/hyphen).' });
  }
  if (!isNonNegativeInteger(payload?.amount)) {
    errors.push({ field: 'amount', message: 'amount is required and must be a non-negative integer number of paise (no floating point).' });
  }

  const attributes = {};
  for (const attribute of KNOWN_TRANSACTION_ATTRIBUTES) {
    if (payload?.[attribute] !== undefined) {
      if (typeof payload[attribute] !== 'string' || payload[attribute] === '') {
        errors.push({ field: attribute, message: `${attribute} must be a non-empty string when provided.` });
      } else {
        attributes[attribute] = payload[attribute];
      }
    }
  }

  if (errors.length > 0) {
    throw AppError.badRequest('Transaction payload failed validation.', 'VALIDATION_ERROR', { errors });
  }

  return { direction: payload.direction, transactionId: payload.transactionId, amount: payload.amount, attributes };
}

/** BRD §3.1/§3.2 / STORY-08-02 — `_id` gains the direction segment: `{clientId, direction, transactionId}`. An outward and an inward transaction sharing the identical transactionId now claim different mutexes entirely (AC3/UAT 50). */
export function buildClaimDocument({ clientId, direction, transactionId, requestData, now, instanceId }) {
  return {
    _id: { clientId, direction, transactionId },
    clientId,
    direction,
    transactionId,
    status: TRANSACTION_STATUS.PENDING,
    requestData,
    claimedAt: now,
    updatedAt: now,
    instanceId,
  };
}

/**
 * BRD §2.4 step 3.1 — "Extract that dimension's attribute values. Missing
 * required attribute → dimension skipped as not applicable." Returns null
 * (skip) rather than a partial map, so a caller never accidentally
 * evaluates a dimension against incomplete attribute data.
 */
export function extractAttributeMap(dimensionAttributes, requestAttributes) {
  const map = {};
  for (const attribute of dimensionAttributes) {
    const value = requestAttributes?.[attribute];
    if (value === undefined) {
      return null;
    }
    map[attribute] = value;
  }
  return map;
}

export function attributeMapToOrderedValues(dimensionAttributes, attributeMap) {
  return dimensionAttributes.map((attribute) => attributeMap[attribute]);
}
