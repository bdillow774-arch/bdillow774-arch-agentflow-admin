import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DASHBOARD_SESSION_COOKIE, hasDashboardAccess } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const accessToken = String(body?.accessToken || '').trim();

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Access token is required.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);

    if (error || !data.user) {
      return NextResponse.json(
        { ok: false, error: 'Dashboard session is invalid or expired.' },
        { status: 401 },
      );
    }

    if (!hasDashboardAccess(data.user)) {
      return NextResponse.json(
        { ok: false, error: 'This account does not have dashboard access.' },
        { status: 403 },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(DASHBOARD_SESSION_COOKIE, accessToken, buildCookieOptions());

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Admin session create failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Could not create dashboard session.' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(DASHBOARD_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
