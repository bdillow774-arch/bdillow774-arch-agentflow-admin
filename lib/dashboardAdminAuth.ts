import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

export const DASHBOARD_SESSION_COOKIE = 'agentflow_dashboard_access_token';

export function hasDashboardAccess(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  return (
    user.app_metadata?.dashboard_admin === true ||
    user.user_metadata?.role === 'dashboard_admin' ||
    user.user_metadata?.role === 'admin'
  );
}

function isDashboardAccessActive(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  return user.app_metadata?.dashboard_active !== false;
}

function buildAuthErrorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function getRequestToken() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value ?? null;
}

export async function requireDashboardAdmin() {
  const accessToken = await getRequestToken();

  if (!accessToken) {
    return {
      ok: false as const,
      response: buildAuthErrorResponse('Admin authentication required.', 401),
    };
  }

  const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);

  if (error || !data.user) {
    return {
      ok: false as const,
      response: buildAuthErrorResponse('Dashboard session is invalid or expired.', 401),
    };
  }

  if (!hasDashboardAccess(data.user)) {
    return {
      ok: false as const,
      response: buildAuthErrorResponse('This account does not have dashboard access.', 403),
    };
  }

  if (!isDashboardAccessActive(data.user)) {
    return {
      ok: false as const,
      response: buildAuthErrorResponse('Dashboard access for this account is inactive.', 403),
    };
  }

  return {
    ok: true as const,
    accessToken,
    user: data.user as User,
  };
}
