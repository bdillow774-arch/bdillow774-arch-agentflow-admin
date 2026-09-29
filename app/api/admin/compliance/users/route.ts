import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

function isMissingTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('relation') ||
    message.includes('does not exist')
  );
}

async function loadOptionalRows(table: string, column: string, value: string) {
  const { data, error } = await supabaseAdminClient.from(table).select('*').eq(column, value);

  if (!error) {
    return data ?? [];
  }

  if (isMissingTableError(error)) {
    return null;
  }

  throw error;
}

async function loadAuthUser(userId: string, email?: string | null) {
  const { data, error } = await supabaseAdminClient.auth.admin.listUsers({
    perPage: 1000,
  });

  if (error) {
    throw error;
  }

  return (data.users ?? []).find(
    (user) =>
      user.id === userId ||
      (email ? String(user.email || '').toLowerCase() === email.toLowerCase() : false),
  );
}

export async function GET(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const userId = String(url.searchParams.get('userId') || '').trim();
    const emailParam = String(url.searchParams.get('email') || '').trim().toLowerCase();

    if (!userId && !emailParam) {
      return NextResponse.json(
        { ok: false, error: 'userId or email is required.' },
        { status: 400 },
      );
    }

    let appUser: Record<string, any> | null = null;

    if (userId) {
      const { data } = await supabaseAdminClient.from('users').select('*').eq('id', userId).maybeSingle();
      appUser = data ?? null;
    }

    if (!appUser && emailParam) {
      const { data } = await supabaseAdminClient
        .from('users')
        .select('*')
        .ilike('email', emailParam)
        .maybeSingle();
      appUser = data ?? null;
    }

    const effectiveUserId = String(appUser?.id || userId || '').trim();
    const effectiveEmail = String(appUser?.email || emailParam || '').trim().toLowerCase() || null;

    const [profileResult, authUser, consentRows, dsrRows, subscriptionRows, openHouseRows] =
      await Promise.all([
        effectiveUserId
          ? supabaseAdminClient.from('profiles').select('*').eq('id', effectiveUserId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loadAuthUser(effectiveUserId, effectiveEmail),
        effectiveUserId ? loadOptionalRows('privacy_consents', 'user_id', effectiveUserId) : Promise.resolve(null),
        effectiveUserId
          ? loadOptionalRows('data_subject_requests', 'user_id', effectiveUserId)
          : Promise.resolve(null),
        effectiveUserId
          ? loadOptionalRows('subscription_events', 'app_user_id', effectiveUserId)
          : Promise.resolve(null),
        effectiveEmail
          ? supabaseAdminClient
              .from('open_house_leads')
              .select('*')
              .ilike('email', effectiveEmail)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (profileResult.error && !isMissingTableError(profileResult.error)) {
      throw profileResult.error;
    }

    if (openHouseRows.error && !isMissingTableError(openHouseRows.error)) {
      throw openHouseRows.error;
    }

    const exportPayload = {
      exported_at: new Date().toISOString(),
      lookup: {
        user_id: effectiveUserId || null,
        email: effectiveEmail,
      },
      app_user: appUser,
      profile: profileResult.data ?? null,
      auth_user: authUser ?? null,
      open_house_leads: openHouseRows.data ?? [],
      privacy_consents: consentRows,
      data_subject_requests: dsrRows,
      subscription_events: subscriptionRows,
    };

    await logAdminAudit({
      action: 'export',
      resourceType: 'user_compliance_export',
      actor: auth.user,
      request: req,
      resourceId: effectiveUserId || effectiveEmail,
      targetUserId: effectiveUserId || null,
      targetEmail: effectiveEmail,
      details: {
        hasAppUser: Boolean(appUser),
        hasProfile: Boolean(profileResult.data),
      },
    });

    return NextResponse.json({
      ok: true,
      export: exportPayload,
      warnings: [
        consentRows === null ? 'privacy_consents table is not installed yet.' : null,
        dsrRows === null ? 'data_subject_requests table is not installed yet.' : null,
        subscriptionRows === null ? 'subscription_events table is not installed yet.' : null,
      ].filter(Boolean),
    });
  } catch (error: any) {
    console.error('Compliance export failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to export user compliance data.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const requestType = String(body?.requestType || '').trim().toLowerCase();
    const userId = String(body?.userId || '').trim() || null;
    const email = String(body?.email || '').trim().toLowerCase() || null;
    const notes = String(body?.notes || '').trim() || null;

    if (!requestType || !['export', 'delete'].includes(requestType)) {
      return NextResponse.json(
        { ok: false, error: 'requestType must be "export" or "delete".' },
        { status: 400 },
      );
    }

    if (!userId && !email) {
      return NextResponse.json(
        { ok: false, error: 'userId or email is required.' },
        { status: 400 },
      );
    }

    const payload = {
      request_type: requestType,
      status: 'pending',
      user_id: userId,
      email,
      submitted_by_user_id: auth.user.id,
      submitted_by_email: auth.user.email ?? null,
      notes,
    };

    const { data, error } = await supabaseAdminClient
      .from('data_subject_requests')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'data_subject_requests table is missing. Apply database/buyer-readiness.sql before using compliance request logging.',
          },
          { status: 500 },
        );
      }

      throw error;
    }

    await logAdminAudit({
      action: requestType === 'delete' ? 'request_delete' : 'export',
      resourceType: 'data_subject_request',
      actor: auth.user,
      request: req,
      resourceId: data.id,
      targetUserId: userId,
      targetEmail: email,
      details: {
        requestType,
      },
    });

    return NextResponse.json({ ok: true, request: data });
  } catch (error: any) {
    console.error('Compliance request create failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to create compliance request.' },
      { status: 500 },
    );
  }
}
