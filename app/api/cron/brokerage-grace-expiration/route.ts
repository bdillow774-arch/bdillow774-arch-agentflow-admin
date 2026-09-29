import { NextResponse } from 'next/server';
import {
  expiredGraceTargetStateForStripeStatus,
  shouldExpireGracePeriod,
} from '@/lib/brokerageRules.mjs';
import { recordBrokerageEvent } from '@/lib/brokerageServer';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';
import { retrieveStripeSubscription } from '@/lib/stripeBrokerage';

export const runtime = 'nodejs';

function cronSecret() {
  return process.env.CRON_SECRET?.trim() || '';
}

function isAuthorized(req: Request) {
  const secret = cronSecret();
  if (!secret) return { ok: false, status: 503, error: 'CRON_SECRET is not configured.' };

  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`
    ? { ok: true }
    : { ok: false, status: 401, error: 'Unauthorized.' };
}

function toIsoFromUnix(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function subscriptionPeriodStart(subscription: any) {
  return subscription?.current_period_start ?? subscription?.items?.data?.[0]?.current_period_start;
}

function subscriptionPeriodEnd(subscription: any) {
  return subscription?.current_period_end ?? subscription?.items?.data?.[0]?.current_period_end;
}

function patchForSubscriptionTarget({
  brokerage,
  subscription,
  nowIso,
}: {
  brokerage: any;
  subscription: any;
  nowIso: string;
}) {
  const targetState = expiredGraceTargetStateForStripeStatus(subscription?.status);
  const recovered = targetState === 'active';

  return {
    subscription_state: targetState,
    stripe_subscription_status: subscription?.status ?? brokerage.stripe_subscription_status ?? null,
    current_period_start: toIsoFromUnix(subscriptionPeriodStart(subscription)),
    current_period_end: toIsoFromUnix(subscriptionPeriodEnd(subscription)),
    cancel_at_period_end: subscription?.cancel_at_period_end === true,
    canceled_at: toIsoFromUnix(subscription?.canceled_at),
    grace_period_ends_at: null,
    suspended_at: recovered ? null : nowIso,
    reactivated_at: recovered ? nowIso : brokerage.reactivated_at,
    updated_at: nowIso,
  };
}

async function updateStillExpiredGrace(brokerage: any, patch: Record<string, unknown>, nowIso: string) {
  return supabaseAdminClient
    .from('brokerages')
    .update(patch)
    .eq('id', brokerage.id)
    .eq('subscription_state', 'grace_period')
    .lte('grace_period_ends_at', nowIso)
    .select('id, subscription_state, grace_period_ends_at, suspended_at, reactivated_at')
    .maybeSingle();
}

async function processBrokerage(brokerage: any, now: Date) {
  if (!shouldExpireGracePeriod(brokerage, now)) {
    return { brokerageId: brokerage.id, status: 'skipped_current' };
  }

  const nowIso = now.toISOString();
  let subscription: any = null;

  if (brokerage.stripe_subscription_id) {
    try {
      subscription = await retrieveStripeSubscription(brokerage.stripe_subscription_id);
    } catch (error: any) {
      await recordBrokerageEvent({
        brokerageId: brokerage.id,
        eventType: 'grace_period_expiration_reconcile_failed',
        details: {
          stripe_subscription_id: brokerage.stripe_subscription_id,
          error: error?.message || 'Stripe reconciliation failed.',
        },
      });

      return {
        brokerageId: brokerage.id,
        status: 'skipped_reconcile_failed',
        error: error?.message || 'Stripe reconciliation failed.',
      };
    }
  }

  const patch = subscription
    ? patchForSubscriptionTarget({ brokerage, subscription, nowIso })
    : {
        subscription_state: 'suspended',
        grace_period_ends_at: null,
        suspended_at: nowIso,
        updated_at: nowIso,
      };

  const { data, error } = await updateStillExpiredGrace(brokerage, patch, nowIso);
  if (error) throw error;
  if (!data) return { brokerageId: brokerage.id, status: 'skipped_concurrent_update' };

  const recovered = data.subscription_state === 'active';
  await recordBrokerageEvent({
    brokerageId: brokerage.id,
    eventType: recovered
      ? 'grace_period_recovered_before_expiration'
      : 'grace_period_expired',
    details: {
      previous_state: 'grace_period',
      subscription_state: data.subscription_state,
      stripe_subscription_id: brokerage.stripe_subscription_id ?? null,
      stripe_subscription_status: subscription?.status ?? null,
    },
  });

  return { brokerageId: brokerage.id, status: recovered ? 'recovered' : data.subscription_state };
}

async function handleGraceExpiration(req: Request) {
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: brokerages, error } = await supabaseAdminClient
    .from('brokerages')
    .select('*')
    .eq('subscription_state', 'grace_period')
    .lte('grace_period_ends_at', nowIso);

  if (error) throw error;

  const results = [];
  for (const brokerage of brokerages ?? []) {
    results.push(await processBrokerage(brokerage, now));
  }

  return NextResponse.json({
    ok: true,
    checked: brokerages?.length ?? 0,
    results,
  });
}

export async function GET(req: Request) {
  try {
    return await handleGraceExpiration(req);
  } catch (error: any) {
    console.error('Brokerage grace expiration failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Brokerage grace expiration failed.' },
      { status: 500 },
    );
  }
}

export const POST = GET;
