import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';
import { createStripeCheckoutSession } from '@/lib/stripeBrokerage';

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
      .select('*')
      .eq('id', brokerageId)
      .single();

    if (error) throw error;

    const baseUrl = appUrl(req);
    const session = await createStripeCheckoutSession({
      brokerageId,
      brokerageName: brokerage.name,
      adminEmail: brokerage.primary_admin_email,
      monthlyPriceCents: brokerage.monthly_price_cents,
      purchasedSeats: brokerage.purchased_seats,
      successUrl: `${baseUrl}/dashboard/brokerages?checkout=success&brokerage=${brokerageId}`,
      cancelUrl: `${baseUrl}/dashboard/brokerages?checkout=cancel&brokerage=${brokerageId}`,
    });

    await supabaseAdminClient
      .from('brokerages')
      .update({
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', brokerageId);

    await logAdminAudit({
      action: 'create',
      resourceType: 'stripe_checkout_session',
      actor: auth.user,
      request: req,
      resourceId: session.id,
      details: { brokerageId },
    });

    return NextResponse.json({ ok: true, checkoutUrl: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error('Brokerage checkout failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to create Stripe Checkout session.' },
      { status: 500 },
    );
  }
}
