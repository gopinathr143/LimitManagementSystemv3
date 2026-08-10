export const CONFIG_AUDIT_COLLECTION = 'configAudit';

export function buildAuditEntry({ clientId, resource, action, actor, before = null, after = null, now }) {
  return {
    clientId,
    resource,
    action,
    actor,
    before,
    after,
    occurredAt: now,
  };
}
