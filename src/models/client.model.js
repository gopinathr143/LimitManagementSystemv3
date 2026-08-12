import { AppError } from '../utils/AppError.js';
import { isValidIanaTimezone } from '../utils/timezone.js';
import { CLIENT_STATUS, ALL_DIRECTIONS, DIRECTION } from '../constants/index.js';

export const CLIENTS_COLLECTION = 'clients';

const CLIENT_ID_PATTERN = /^[A-Z0-9_]{3,64}$/;

function validateEnabledDirections(value, errors) {
  if (value === undefined) {
    return [DIRECTION.OUTWARD];
  }
  if (!Array.isArray(value) || value.length === 0 || !value.every((d) => ALL_DIRECTIONS.includes(d))) {
    errors.push({ field: 'enabledDirections', message: `enabledDirections must be a non-empty array drawn from ${ALL_DIRECTIONS.join(', ')}.` });
    return [];
  }
  return [...new Set(value)];
}

/** STORY-01-01 AC4 — invalid IANA timezone must be rejected and the offending field named. BRD §5 — "only OUTWARD exists" today, so a new client defaults to OUTWARD-only unless explicitly given a wider set. */
export function validateClientCreatePayload(payload) {
  const errors = [];

  if (typeof payload?.clientId !== 'string' || !CLIENT_ID_PATTERN.test(payload.clientId)) {
    errors.push({ field: 'clientId', message: 'clientId must be 3-64 chars of A-Z, 0-9 or underscore.' });
  }
  if (typeof payload?.name !== 'string' || payload.name.trim() === '') {
    errors.push({ field: 'name', message: 'name is required.' });
  }
  if (!isValidIanaTimezone(payload?.timezone)) {
    errors.push({ field: 'timezone', message: `timezone must be a valid IANA timezone name, got: ${payload?.timezone}` });
  }
  const enabledDirections = validateEnabledDirections(payload?.enabledDirections, errors);

  if (errors.length > 0) {
    throw AppError.badRequest('Client payload failed validation.', 'VALIDATION_ERROR', { errors });
  }

  return { enabledDirections };
}

export function validateClientUpdatePayload(payload) {
  const errors = [];

  if (payload.status !== undefined && !Object.values(CLIENT_STATUS).includes(payload.status)) {
    errors.push({ field: 'status', message: `status must be one of ${Object.values(CLIENT_STATUS).join(', ')}.` });
  }
  if (payload.timezone !== undefined && !isValidIanaTimezone(payload.timezone)) {
    errors.push({ field: 'timezone', message: `timezone must be a valid IANA timezone name, got: ${payload.timezone}` });
  }
  if (payload.status === undefined && payload.timezone === undefined && payload.name === undefined) {
    errors.push({ field: '_', message: 'At least one of status, timezone or name must be provided.' });
  }
  if (payload.name !== undefined && (typeof payload.name !== 'string' || payload.name.trim() === '')) {
    errors.push({ field: 'name', message: 'name must be a non-empty string.' });
  }

  if (errors.length > 0) {
    throw AppError.badRequest('Client update payload failed validation.', 'VALIDATION_ERROR', { errors });
  }
}

export function buildClientDocument({ clientId, name, timezone, enabledDirections, createdBy, now }) {
  return {
    _id: clientId,
    clientId,
    name,
    status: CLIENT_STATUS.ACTIVE,
    timezone,
    enabledDirections: enabledDirections ?? [DIRECTION.OUTWARD],
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
}
