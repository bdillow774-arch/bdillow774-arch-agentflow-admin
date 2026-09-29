import type { User } from '@supabase/supabase-js';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

type AuditAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'request_delete'
  | 'webhook';

type AuditEntry = {
  action: AuditAction;
  resourceType: string;
  actor: User;
  request?: Request;
  resourceId?: string | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  details?: Record<string, unknown> | null;
};

function isMissingAuditTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('admin_audit_logs') ||
    message.includes('relation') ||
    message.includes('does not exist')
  );
}

export async function logAdminAudit(entry: AuditEntry) {
  const actorEmail =
    typeof entry.actor.email === 'string' && entry.actor.email.trim().length > 0
      ? entry.actor.email.trim().toLowerCase()
      : null;

  const payload = {
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    actor_user_id: entry.actor.id,
    actor_email: actorEmail,
    target_user_id: entry.targetUserId ?? null,
    target_email: entry.targetEmail ?? null,
    ip_address: entry.request?.headers.get('x-forwarded-for') ?? null,
    user_agent: entry.request?.headers.get('user-agent') ?? null,
    details: entry.details ?? null,
  };

  const { error } = await supabaseAdminClient.from('admin_audit_logs').insert(payload);

  if (!error) {
    return;
  }

  if (isMissingAuditTableError(error)) {
    console.warn(
      '[Audit] admin_audit_logs table is missing. Apply the buyer-readiness SQL migration to enable audit logs.',
    );
    return;
  }

  console.error('[Audit] Failed to write admin audit log.', error);
}
