import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';
import { createStripeCheckoutSession } from '@/lib/stripeBrokerage';

type BrokeragePlan = {
  code: string;
  seat_limit: number | null;
  monthly_price_cents: number | null;
  stripe_price_id: string | null;
  is_custom: boolean;
};

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
      .select('*, brokerage_plans(code, seat_limit, monthly_price_cents, stripe_price_id, is_custom)')
      .eq('id', brokerageId)
      .single();

    if (error) throw error;

    const plan = brokerage.brokerage_plans as BrokeragePlan | null;
    if (!plan) {
      throw new Error('Brokerage plan mapping was not found.');
    }

    if (plan.is_custom) {
      throw new Error('Custom 251+ brokerage plans require manual billing setup.');
    }

    if (plan.seat_limit !== brokerage.purchased_seats) {
      throw new Error('Brokerage seat count does not match the mapped plan.');
    }

    if (plan.monthly_price_cents !== brokerage.monthly_price_cents) {
      throw new Error('Brokerage monthly price does not match the mapped plan.');
    }

    if (!plan.stripe_price_id) {
      throw new Error('Stripe price mapping is missing for this brokerage plan.');
    }

    const baseUrl = appUrl(req);
    const session = await createStripeCheckoutSession({
      brokerageId,
      brokerageName: brokerage.name,
      adminEmail: brokerage.primary_admin_email,
      priceId: plan.stripe_price_id,
      purchasedSeats: brokerage.purchased_seats,
      successUrl: `${baseUrl}/dashboard/brokerages?checkout=success&brokerage=${brokerageId}`,
      cancelUrl: `${baseUrl}/dashboard/brokerages?checkout=cancel&brokerage=${brokerageId}`,
    });

    await supabaseAdminClient
      .from('brokerages')
      .update({
        stripe_checkout_session_id: session.id,
        stripe_price_id: plan.stripe_price_id,
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
