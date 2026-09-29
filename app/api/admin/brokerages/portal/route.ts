import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';
import { createStripePortalSession } from '@/lib/stripeBrokerage';

function appUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    req.headers.get('origin') ||
    'https://agentflowapp.net'
  ).replace(/\/$/, '');
}

export async function POST(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const brokerageId = String(body?.brokerageId ?? '').trim();
    if (!brokerageId) {
      return NextResponse.json(
        { ok: false, error: 'brokerageId is required.' },
        { status: 400 },
      );
    }

    const { data: brokerage, error } = await supabaseAdminClient
      .from('brokerages')
      .select('id, stripe_customer_id')
      .eq('id', brokerageId)
      .single();

    if (error) throw error;
    if (!brokerage.stripe_customer_id) {
      return NextResponse.json(
        { ok: false, error: 'Brokerage does not have a Stripe customer yet.' },
        { status: 400 },
      );
    }

    const session = await createStripePortalSession({
      customerId: brokerage.stripe_customer_id,
      returnUrl: `${appUrl(req)}/dashboard/brokerages`,
    });

    await logAdminAudit({
      action: 'create',
      resourceType: 'stripe_portal_session',
      actor: auth.user,
      request: req,
      resourceId: session.id,
      details: { brokerageId },
    });

    return NextResponse.json({ ok: true, portalUrl: session.url });
  } catch (error: any) {
    console.error('Brokerage portal failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to create Stripe portal session.' },
      { status: 500 },
    );
  }
}
