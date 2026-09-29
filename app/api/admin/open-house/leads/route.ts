// app/api/admin/open-house/leads/route.ts
import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

// GET /api/admin/open-house/leads?sessionId=...
export async function GET(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required.' },
        { status: 400 }
      );
    }

    const [{ data, error }, { data: sessionData }] = await Promise.all([
      supabaseAdminClient
        .from('open_house_leads')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
      supabaseAdminClient
        .from('open_house_sessions')
        .select('id, property_name')
        .eq('id', sessionId)
        .maybeSingle(),
    ]);

    if (error) throw error;

    const propertyName = sessionData?.property_name ?? null;

    const enrichedLeads = (data || []).map((lead) => ({
        ...lead,
        property_name:
          lead.property_name ?? lead.property_address ?? propertyName,
      }));

    await logAdminAudit({
      action: 'read',
      resourceType: 'open_house_session_leads',
      actor: auth.user,
      request: req,
      resourceId: sessionId,
      details: {
        count: enrichedLeads.length,
      },
    });

    return NextResponse.json({
      leads: enrichedLeads,
    });
  } catch (err: any) {
    console.error('List open house leads failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load open house leads.' },
      { status: 500 }
    );
  }
}
