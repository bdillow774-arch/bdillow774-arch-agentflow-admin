import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

type PromotionSettingsRow = {
  id: string;
  free_trial_enabled: boolean;
  free_trial_length_days: number;
  created_at: string | null;
  updated_at: string | null;
};

async function loadCurrentSettings() {
  const { data, error } = await supabaseAdminClient
    .from('promotion_settings')
    .select('id, free_trial_enabled, free_trial_length_days, created_at, updated_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as PromotionSettingsRow | null;
}

export async function GET() {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const settings = await loadCurrentSettings();

    await logAdminAudit({
      action: 'read',
      resourceType: 'promotion_settings',
      actor: auth.user,
      details: {
        settingsFound: Boolean(settings),
      },
    });

    return NextResponse.json({
      ok: true,
      settings,
    });
  } catch (error: any) {
    console.error('Promotion settings load failed', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message || 'Failed to load promotion settings from Supabase.',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const settings = await loadCurrentSettings();

    if (!settings) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No promotion_settings row found. Create one in Supabase before updating promotions.',
        },
        { status: 404 },
      );
    }

    const patch: Partial<PromotionSettingsRow> = {};

    if (typeof body.free_trial_enabled === 'boolean') {
      patch.free_trial_enabled = body.free_trial_enabled;
    }

    if (
      typeof body.free_trial_length_days === 'number' &&
      Number.isFinite(body.free_trial_length_days)
    ) {
      patch.free_trial_length_days = body.free_trial_length_days;
    }

    const { data, error } = await supabaseAdminClient
      .from('promotion_settings')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)
      .select('id, free_trial_enabled, free_trial_length_days, created_at, updated_at')
      .single();

    if (error) {
      throw error;
    }

    await logAdminAudit({
      action: 'update',
      resourceType: 'promotion_settings',
      actor: auth.user,
      request: req,
      resourceId: settings.id,
      details: patch,
    });

    return NextResponse.json({
      ok: true,
      settings: data,
    });
  } catch (error: any) {
    console.error('Promotion settings update failed', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message || 'Failed to update promotion settings in Supabase.',
      },
      { status: 500 },
    );
  }
}
