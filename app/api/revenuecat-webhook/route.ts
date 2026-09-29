import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

type RevenueCatEvent = {
  api_version: string;
  event: {
    id: string;
    type: string;
    event_timestamp_ms: number;
    app_user_id: string;
    product_id?: string;
    expiration_at_ms?: number | null;
    original_transaction_id?: string;
    environment?: 'SANDBOX' | 'PRODUCTION';
    period_type?: string;
    presented_offering_id?: string | null;
    store?: string;
  };
};

/**
 * RevenueCat Webhooks
 *
 * RevenueCat can optionally include a custom HTTP Authorization header value (configured in
 * RevenueCat → Integrations → Webhooks → (your webhook) → "Authorization header value").
 *
 * We use that as our shared secret. Set REVENUECAT_WEBHOOK_SECRET in .env.local to the EXACT
 * value you enter in RevenueCat (including "Bearer " if you include it).
 */
function timingSafeEqualStr(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyAuthorizationHeader(authHeader: string | null) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[RevenueCat] Missing REVENUECAT_WEBHOOK_SECRET env var.');
    return false;
  }
  if (!authHeader) return false;

  const auth = authHeader.trim();
  const sec = secret.trim();

  // Exact match (recommended: store the full header value in env, e.g. "Bearer <token>")
  if (timingSafeEqualStr(auth, sec)) return true;

  // Convenience: if one side includes "Bearer " and the other doesn't.
  const authLower = auth.toLowerCase();
  const secLower = sec.toLowerCase();
  if (authLower.startsWith('bearer ') && timingSafeEqualStr(auth.slice(7).trim(), sec)) return true;
  if (secLower.startsWith('bearer ') && timingSafeEqualStr(auth, sec)) return true;
  if (secLower.startsWith('bearer ') && timingSafeEqualStr(auth, sec.slice(7).trim())) return true;

  return false;
}

function isMissingTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('relation') ||
    message.includes('does not exist')
  );
}

function normalizeStore(store?: string) {
  const value = String(store || '').toLowerCase();

  if (value.includes('app_store') || value.includes('apple')) {
    return 'apple';
  }

  if (value.includes('play_store') || value.includes('google')) {
    return 'google';
  }

  if (value.includes('stripe') || value.includes('web')) {
    return 'manual';
  }

  return 'manual';
}

function deriveSubscriptionState(event: RevenueCatEvent['event']) {
  const type = String(event.type || '').toUpperCase();
  const isTrial = String(event.period_type || '').toUpperCase() === 'TRIAL';

  if (type === 'EXPIRATION') {
    return {
      account_type: 'free',
      subscription_status: 'inactive',
    };
  }

  if (type === 'BILLING_ISSUE') {
    return {
      account_type: 'paid',
      subscription_status: 'past_due',
    };
  }

  if (type === 'CANCELLATION') {
    return {
      account_type: 'paid',
      subscription_status: 'canceled',
    };
  }

  if (
    [
      'INITIAL_PURCHASE',
      'RENEWAL',
      'PRODUCT_CHANGE',
      'UNCANCELLATION',
      'NON_RENEWING_PURCHASE',
      'SUBSCRIPTION_EXTENDED',
      'TEMPORARY_ENTITLEMENT_GRANT',
    ].includes(type)
  ) {
    return {
      account_type: isTrial ? 'trial' : 'paid',
      subscription_status: isTrial ? 'trial' : 'active',
    };
  }

  return {
    account_type: isTrial ? 'trial' : 'paid',
    subscription_status: isTrial ? 'trial' : 'active',
  };
}

async function persistSubscriptionEvent(payload: RevenueCatEvent) {
  const evt = payload.event;

  const { error } = await supabaseAdminClient.from('subscription_events').upsert(
    {
      provider: 'revenuecat',
      event_id: evt.id,
      event_type: evt.type,
      app_user_id: evt.app_user_id,
      original_transaction_id: evt.original_transaction_id ?? null,
      product_id: evt.product_id ?? null,
      store: evt.store ?? null,
      environment: evt.environment ?? null,
      period_type: evt.period_type ?? null,
      expiration_at: evt.expiration_at_ms
        ? new Date(evt.expiration_at_ms).toISOString()
        : null,
      raw_payload: payload,
    },
    { onConflict: 'event_id' },
  );

  if (error && !isMissingTableError(error)) {
    throw error;
  }

  if (error && isMissingTableError(error)) {
    throw new Error(
      'subscription_events table is missing. Apply database/buyer-readiness.sql to persist billing events.',
    );
  }

  const { data: persistedEvent, error: readBackError } = await supabaseAdminClient
    .from('subscription_events')
    .select('event_id')
    .eq('event_id', evt.id)
    .maybeSingle();

  if (readBackError) {
    throw readBackError;
  }

  if (!persistedEvent) {
    throw new Error(`RevenueCat event ${evt.id} was accepted but not persisted.`);
  }
}

async function reconcileUserSubscription(event: RevenueCatEvent['event']) {
  const state = deriveSubscriptionState(event);

  const patch = {
    account_type: state.account_type,
    subscription_status: state.subscription_status,
    subscription_provider: normalizeStore(event.store),
    subscription_current_period_end: event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null,
  };

  const { error } = await supabaseAdminClient
    .from('users')
    .update(patch)
    .eq('id', event.app_user_id);

  if (error) {
    throw error;
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const rawBody = await req.text();

  if (!verifyAuthorizationHeader(authHeader)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  let payload: RevenueCatEvent | null = null;

  try {
    payload = JSON.parse(rawBody) as RevenueCatEvent;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const evt = payload.event;

    console.log('[RevenueCat] Webhook event received:', {
      id: evt.id,
      type: evt.type,
      app_user_id: evt.app_user_id,
      product_id: evt.product_id,
      environment: evt.environment,
      expiration_at_ms: evt.expiration_at_ms,
      period_type: evt.period_type,
      store: evt.store,
    });

    await persistSubscriptionEvent(payload);
    await reconcileUserSubscription(evt);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[RevenueCat] Webhook handler error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
