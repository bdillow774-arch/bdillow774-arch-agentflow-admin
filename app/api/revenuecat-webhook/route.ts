import { NextResponse } from 'next/server';
import crypto from 'crypto';

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

    // TODO: your logic here:
    // - lookup user by app_user_id
    // - set subscription status based on evt.type / expiration
    // - write to DB (Supabase)
    // - optionally log to an "events" table for audit/stability

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[RevenueCat] Webhook handler error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}

