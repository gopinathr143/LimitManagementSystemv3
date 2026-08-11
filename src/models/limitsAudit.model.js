export const LIMITS_AUDIT_COLLECTION = 'limitsAudit';

export function buildLimitsAuditEntry({ clientId, resource, action, actor, definitionVersion = null, before = null, after = null, now }) {
  return {
    clientId,
    resource,
    action,
    actor,
    definitionVersion,
    before,
    after,
    occurredAt: now,
  };
}
