import { NextResponse } from 'next/server';
import { recordBrokerageEvent } from '@/lib/brokerageServer';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';
import { getStripeWebhookSecret, verifyStripeSignature } from '@/lib/stripeBrokerage';

export const runtime = 'nodejs';

function toIsoFromUnix(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function gracePeriodEnd() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function mapSubscriptionState(stripeStatus: string | null | undefined) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'grace_period';
    case 'canceled':
      return 'canceled';
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'incomplete';
  }
}

async function persistWebhookEvent(event: any) {
  const { error } = await supabaseAdminClient.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode ?? null,
    raw_payload: event,
  });

  if (!error) return 'created';

  if (error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
    return 'duplicate';
  }

  throw error;
}

async function findBrokerageForStripeObject(object: any) {
  const brokerageId = object?.metadata?.brokerage_id || object?.client_reference_id;
  if (brokerageId) {
    const { data } = await supabaseAdminClient
      .from('brokerages')
      .select('*')
      .eq('id', brokerageId)
      .maybeSingle();
    if (data) return data;
  }

  const subscriptionId =
    typeof object?.subscription === 'string' ? object.subscription : object?.id;
  const customerId =
    typeof object?.customer === 'string' ? object.customer : object?.customer?.id;

  let query = supabaseAdminClient.from('brokerages').select('*');
  if (subscriptionId) query = query.eq('stripe_subscription_id', subscriptionId);
  else if (customerId) query = query.eq('stripe_customer_id', customerId);
  else return null;

  const { data } = await query.maybeSingle();
  return data;
}

async function reconcileCheckoutSession(session: any) {
  const brokerage = await findBrokerageForStripeObject(session);
  if (!brokerage) return;

  const subscriptionStatus = String(session.payment_status || '') === 'paid'
    ? 'active'
    : brokerage.subscription_state;

  const patch = {
    stripe_customer_id:
      typeof session.customer === 'string' ? session.customer : brokerage.stripe_customer_id,
    stripe_subscription_id:
      typeof session.subscription === 'string'
        ? session.subscription
        : brokerage.stripe_subscription_id,
    stripe_checkout_session_id: session.id,
    subscription_state: subscriptionStatus,
    updated_at: new Date().toISOString(),
  };

  await supabaseAdminClient.from('brokerages').update(patch).eq('id', brokerage.id);
  await recordBrokerageEvent({
    brokerageId: brokerage.id,
    eventType: 'stripe_checkout_completed',
    details: { session_id: session.id, payment_status: session.payment_status },
  });
}

async function reconcileSubscription(subscription: any, eventType: string) {
  const brokerage = await findBrokerageForStripeObject(subscription);
  if (!brokerage) return;

  const state = mapSubscriptionState(subscription.status);
  const recovered = brokerage.subscription_state !== 'active' && state === 'active';
  const patch: Record<string, unknown> = {
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : brokerage.stripe_customer_id,
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status ?? null,
    subscription_state: state,
    current_period_start: toIsoFromUnix(subscription.current_period_start),
    current_period_end: toIsoFromUnix(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end === true,
    canceled_at: toIsoFromUnix(subscription.canceled_at),
    grace_period_ends_at:
      state === 'grace_period'
        ? brokerage.grace_period_ends_at ?? gracePeriodEnd()
        : null,
    suspended_at: brokerage.suspended_at,
    reactivated_at: recovered ? new Date().toISOString() : brokerage.reactivated_at,
    updated_at: new Date().toISOString(),
  };

  if (eventType === 'customer.subscription.deleted') {
    patch.subscription_state = 'expired';
    patch.grace_period_ends_at = null;
    patch.suspended_at = new Date().toISOString();
  }

  await supabaseAdminClient.from('brokerages').update(patch).eq('id', brokerage.id);
  await recordBrokerageEvent({
    brokerageId: brokerage.id,
    eventType,
    details: { stripe_status: subscription.status, subscription_id: subscription.id },
  });
}

async function reconcileInvoice(invoice: any, eventType: string) {
  const brokerage = await findBrokerageForStripeObject(invoice);
  if (!brokerage) return;

  if (eventType === 'invoice.payment_succeeded') {
    await supabaseAdminClient
      .from('brokerages')
      .update({
        subscription_state: 'active',
        grace_period_ends_at: null,
        reactivated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', brokerage.id);
  }

  if (eventType === 'invoice.payment_failed') {
    await supabaseAdminClient
      .from('brokerages')
      .update({
        subscription_state: 'grace_period',
        grace_period_ends_at: brokerage.grace_period_ends_at ?? gracePeriodEnd(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', brokerage.id);
  }

  await recordBrokerageEvent({
    brokerageId: brokerage.id,
    eventType,
    details: {
      invoice_id: invoice.id,
      subscription_id: invoice.subscription,
      amount_due: invoice.amount_due,
    },
  });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('stripe-signature');

  if (
    !verifyStripeSignature({
      rawBody,
      signatureHeader,
      secret: getStripeWebhookSecret(),
    })
  ) {
    return NextResponse.json(
      { ok: false, error: 'Invalid Stripe signature.' },
      { status: 401 },
    );
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    const status = await persistWebhookEvent(event);
    if (status === 'duplicate') {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const object = event.data?.object;

    if (event.type === 'checkout.session.completed') {
      await reconcileCheckoutSession(object);
    } else if (String(event.type).startsWith('customer.subscription.')) {
      await reconcileSubscription(object, event.type);
    } else if (
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'invoice.payment_failed'
    ) {
      await reconcileInvoice(object, event.type);
    }

    await supabaseAdminClient
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Stripe webhook failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Stripe webhook failed.' },
      { status: 500 },
    );
  }
}
