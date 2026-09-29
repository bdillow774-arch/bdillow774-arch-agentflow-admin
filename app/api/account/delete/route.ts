import { NextResponse } from 'next/server';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

export const runtime = 'nodejs';

type DeleteResult = {
  table: string;
  column: string;
  status: 'deleted' | 'anonymized' | 'recorded' | 'skipped';
  reason?: string;
};

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }

  return token.trim();
}

function isIgnorableDeleteError(error: {
  code?: string;
  message?: string;
} | null | undefined) {
  const message = String(error?.message || '').toLowerCase();

  return (
    error?.code === '42P01' ||
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  );
}

function hasDashboardAccess(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  return (
    user.app_metadata?.dashboard_admin === true ||
    user.user_metadata?.role === 'dashboard_admin' ||
    user.user_metadata?.role === 'admin'
  );
}

async function deleteByColumn(
  table: string,
  column: string,
  value: string | null | undefined,
): Promise<DeleteResult> {
  if (!value) {
    return {
      table,
      column,
      status: 'skipped',
      reason: 'missing value',
    };
  }

  const { error } = await supabaseAdminClient
    .from(table)
    .delete()
    .eq(column, value);

  if (!error) {
    return { table, column, status: 'deleted' };
  }

  if (isIgnorableDeleteError(error)) {
    return {
      table,
      column,
      status: 'skipped',
      reason: error.message,
    };
  }

  throw error;
}

async function anonymizeByColumn(
  table: string,
  column: string,
  value: string | null | undefined,
  fields: Record<string, unknown>,
): Promise<DeleteResult> {
  if (!value) {
    return {
      table,
      column,
      status: 'skipped',
      reason: 'missing value',
    };
  }

  const { error } = await supabaseAdminClient
    .from(table)
    .update(fields)
    .eq(column, value);

  if (!error) {
    return { table, column, status: 'anonymized' };
  }

  if (isIgnorableDeleteError(error)) {
    return {
      table,
      column,
      status: 'skipped',
      reason: error.message,
    };
  }

  throw error;
}

async function recordDeletionRequest(
  userId: string,
  email: string | null,
): Promise<DeleteResult> {
  const { error } = await supabaseAdminClient
    .from('data_subject_requests')
    .insert({
      request_type: 'account_deletion',
      status: 'completed',
      user_id: userId,
      email,
      submitted_by_user_id: userId,
      submitted_by_email: email,
      notes:
        'User initiated account deletion in the AgentFlow mobile app. Auth, profile, and app account records were deleted. Limited pseudonymous operational and billing records may be retained for accounting, fraud prevention, analytics, compliance, and business reporting.',
      completed_at: new Date().toISOString(),
    });

  if (!error) {
    return {
      table: 'data_subject_requests',
      column: 'user_id',
      status: 'recorded',
    };
  }

  if (isIgnorableDeleteError(error)) {
    return {
      table: 'data_subject_requests',
      column: 'user_id',
      status: 'skipped',
      reason: error.message,
    };
  }

  throw error;
}

async function deleteAccount(req: Request) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Authorization bearer token is required.' },
        { status: 401 },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdminClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired session.' },
        { status: 401 },
      );
    }

    if (hasDashboardAccess(user)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Dashboard admin accounts cannot be deleted from the mobile account endpoint.',
        },
        { status: 403 },
      );
    }

    const userId = user.id;
    const email = user.email?.trim().toLowerCase() || null;

    const deletionRequestResult = await recordDeletionRequest(userId, email);

    const cleanupResults = await Promise.all([
      Promise.resolve(deletionRequestResult),
      deleteByColumn('profiles', 'id', userId),
      deleteByColumn('profiles', 'user_id', userId),
      deleteByColumn('profiles', 'auth_user_id', userId),
      deleteByColumn('profiles', 'email', email),
      deleteByColumn('users', 'id', userId),
      deleteByColumn('users', 'email', email),
      deleteByColumn('privacy_consents', 'user_id', userId),
      deleteByColumn('user_consents', 'user_id', userId),
      deleteByColumn('mileage_logs', 'user_id', userId),
      anonymizeByColumn('user_activity_events', 'user_id', userId, {
        email: null,
      }),
      anonymizeByColumn('open_house_sessions', 'host_user_id', userId, {
        host_user_id: null,
      }),
    ]);

    const { error: deleteAuthError } =
      await supabaseAdminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      throw deleteAuthError;
    }

    return NextResponse.json({
      ok: true,
      deleted: {
        user_id: userId,
        email,
        auth_user: true,
        records: cleanupResults,
      },
    });
  } catch (error: any) {
    console.error('Mobile account deletion failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to delete account.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return deleteAccount(req);
}

export async function DELETE(req: Request) {
  return deleteAccount(req);
}
