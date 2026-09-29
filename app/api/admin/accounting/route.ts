import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

type SubscriptionProvider = 'none' | 'apple' | 'google' | 'manual';

const MONTHLY_PRICE = 4.99;

const DEFAULTS = {
  appleRate: 0.15,
  androidRate: 0.15,
  manualProcessorRate: 0.03,
  googleMapsMonthly: 0,
  revenueCatMonthly: 0,
};

const REVENUE_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
]);

function isMissingTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
}

function monthStart(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 7) + '-01';
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function normalizeStore(store?: string): SubscriptionProvider {
  const value = String(store || '').toLowerCase();

  if (value.includes('app_store') || value.includes('apple')) return 'apple';
  if (value.includes('play_store') || value.includes('google')) return 'google';
  if (value.includes('stripe') || value.includes('web')) return 'manual';
  return 'manual';
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createRevenueBucket() {
  return {
    providerCounts: {
      apple: 0,
      google: 0,
      manual: 0,
      none: 0,
    },
    providerRevenue: {
      apple: 0,
      google: 0,
      manual: 0,
      none: 0,
    },
  };
}

export async function GET() {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const [usersResult, subscriptionEventsResult, usageCostsResult] = await Promise.all([
      supabaseAdminClient
        .from('users')
        .select('id, account_type, subscription_status, subscription_provider'),
      supabaseAdminClient
        .from('subscription_events')
        .select('*')
        .order('created_at', { ascending: false }),
      supabaseAdminClient
        .from('usage_cost_monthly')
        .select('*')
        .order('month_start', { ascending: false }),
    ]);

    if (usersResult.error) throw usersResult.error;

    const warnings: string[] = [];

    const subscriptionEvents =
      subscriptionEventsResult.error && isMissingTableError(subscriptionEventsResult.error)
        ? []
        : ((subscriptionEventsResult.data ?? []) as Array<Record<string, any>>);

    if (subscriptionEventsResult.error && isMissingTableError(subscriptionEventsResult.error)) {
      warnings.push('subscription_events table is not installed yet.');
    } else if (subscriptionEventsResult.error) {
      throw subscriptionEventsResult.error;
    }

    const usageCosts =
      usageCostsResult.error && isMissingTableError(usageCostsResult.error)
        ? []
        : ((usageCostsResult.data ?? []) as Array<Record<string, any>>);

    if (usageCostsResult.error && isMissingTableError(usageCostsResult.error)) {
      warnings.push('usage_cost_monthly table is not installed yet.');
    } else if (usageCostsResult.error) {
      throw usageCostsResult.error;
    }

    const users = usersResult.data ?? [];
    const activePaidUsers = users.filter(
      (user) =>
        user.account_type === 'paid' && user.subscription_status === 'active',
    );

    const currentRevenue = createRevenueBucket();
    activePaidUsers.forEach((user) => {
      const provider = (user.subscription_provider ?? 'none') as SubscriptionProvider;
      currentRevenue.providerCounts[provider] += 1;
      currentRevenue.providerRevenue[provider] += MONTHLY_PRICE;
    });

    const monthlyRevenueMap = new Map<
      string,
      ReturnType<typeof createRevenueBucket>
    >();

    for (const event of subscriptionEvents) {
      const eventType = String(event.event_type || '').toUpperCase();
      const periodType = String(event.period_type || '').toUpperCase();
      if (!REVENUE_EVENT_TYPES.has(eventType) || periodType === 'TRIAL') {
        continue;
      }

      const rawPayload = (event.raw_payload ?? {}) as Record<string, any>;
      const rawEvent = (rawPayload.event ?? {}) as Record<string, any>;
      const bucketKey = monthStart(
        rawEvent.event_timestamp_ms
          ? new Date(Number(rawEvent.event_timestamp_ms))
          : event.created_at,
      );
      const bucket = monthlyRevenueMap.get(bucketKey) ?? createRevenueBucket();
      const provider = normalizeStore(String(event.store || rawEvent.store || ''));

      bucket.providerCounts[provider] += 1;
      bucket.providerRevenue[provider] += MONTHLY_PRICE;
      monthlyRevenueMap.set(bucketKey, bucket);
    }

    const currentMonthKey = monthStart(new Date());
    if (!monthlyRevenueMap.has(currentMonthKey)) {
      monthlyRevenueMap.set(currentMonthKey, currentRevenue);
    }

    const usageCostMap = new Map<
      string,
      Record<string, { amount: number; usageCount: number; notes: string | null }>
    >();

    for (const row of usageCosts) {
      const bucket = usageCostMap.get(String(row.month_start)) ?? {};
      bucket[String(row.service)] = {
        amount: safeNumber(row.amount),
        usageCount: safeNumber(row.usage_count),
        notes: typeof row.notes === 'string' ? row.notes : null,
      };
      usageCostMap.set(String(row.month_start), bucket);
    }

    const monthKeys = Array.from(
      new Set([...monthlyRevenueMap.keys(), ...usageCostMap.keys(), currentMonthKey]),
    ).sort((a, b) => b.localeCompare(a));

    const monthly = monthKeys.map((key) => {
      const revenue = monthlyRevenueMap.get(key) ?? createRevenueBucket();
      const costs = usageCostMap.get(key) ?? {};
      const grossRevenue = Object.values(revenue.providerRevenue).reduce(
        (sum, value) => sum + value,
        0,
      );

      const appleFees =
        costs.apple_fees?.amount ?? revenue.providerRevenue.apple * DEFAULTS.appleRate;
      const googleFees =
        costs.google_fees?.amount ?? revenue.providerRevenue.google * DEFAULTS.androidRate;
      const manualProcessorFees =
        costs.manual_processor_fees?.amount ??
        revenue.providerRevenue.manual * DEFAULTS.manualProcessorRate;
      const revenueCatFees =
        costs.revenuecat_fees?.amount ?? DEFAULTS.revenueCatMonthly;
      const googleMapsFees =
        costs.google_maps?.amount ?? DEFAULTS.googleMapsMonthly;

      const totalExpenses =
        appleFees +
        googleFees +
        manualProcessorFees +
        revenueCatFees +
        googleMapsFees;

      return {
        monthStart: key,
        grossRevenue,
        providerCounts: revenue.providerCounts,
        providerRevenue: revenue.providerRevenue,
        costs: {
          appleFees,
          googleFees,
          manualProcessorFees,
          revenueCatFees,
          googleMapsFees,
        },
        googleMapsUsageCount: costs.google_maps?.usageCount ?? 0,
        totalExpenses,
        netProfit: grossRevenue - totalExpenses,
      };
    });

    const currentMonth = monthly[0] ?? {
      monthStart: currentMonthKey,
      grossRevenue: 0,
      providerCounts: currentRevenue.providerCounts,
      providerRevenue: currentRevenue.providerRevenue,
      costs: {
        appleFees: 0,
        googleFees: 0,
        manualProcessorFees: 0,
        revenueCatFees: 0,
        googleMapsFees: 0,
      },
      googleMapsUsageCount: 0,
      totalExpenses: 0,
      netProfit: 0,
    };

    await logAdminAudit({
      action: 'read',
      resourceType: 'accounting',
      actor: auth.user,
      details: {
        months: monthly.length,
        currentMonth: currentMonth.monthStart,
        grossRevenue: currentMonth.grossRevenue,
      },
    });

    return NextResponse.json({
      ok: true,
      monthlyPrice: MONTHLY_PRICE,
      warnings,
      assumptions: DEFAULTS,
      revenue: {
        activePaidUsers: activePaidUsers.length,
        grossRevenue: currentMonth.grossRevenue,
        providerCounts: currentMonth.providerCounts,
        providerRevenue: currentMonth.providerRevenue,
      },
      expenses: {
        appleFees: currentMonth.costs.appleFees,
        androidFees: currentMonth.costs.googleFees,
        subscriptionPlatformFees:
          currentMonth.costs.manualProcessorFees + currentMonth.costs.revenueCatFees,
        googleMapsFees: currentMonth.costs.googleMapsFees,
      },
      totals: {
        totalExpenses: currentMonth.totalExpenses,
        netProfit: currentMonth.netProfit,
      },
      monthly,
    });
  } catch (error: any) {
    console.error('Accounting load failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to load accounting data.' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const monthStartValue = String(body?.monthStart || '').trim();
    const services = (body?.services ?? {}) as Record<
      string,
      { amount?: number; usageCount?: number; notes?: string | null }
    >;

    if (!monthStartValue) {
      return NextResponse.json(
        { ok: false, error: 'monthStart is required.' },
        { status: 400 },
      );
    }

    const rows = Object.entries(services).map(([service, config]) => ({
      month_start: monthStartValue,
      service,
      amount: safeNumber(config.amount),
      usage_count:
        config.usageCount === undefined ? 0 : safeNumber(config.usageCount),
      notes: typeof config.notes === 'string' ? config.notes : null,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'At least one service payload is required.' },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdminClient
      .from('usage_cost_monthly')
      .upsert(rows, { onConflict: 'month_start,service' });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'usage_cost_monthly table is missing. Apply database/buyer-readiness.sql before saving monthly costs.',
          },
          { status: 500 },
        );
      }

      throw error;
    }

    await logAdminAudit({
      action: 'update',
      resourceType: 'usage_cost_monthly',
      actor: auth.user,
      request: req,
      resourceId: monthStartValue,
      details: {
        services: Object.keys(services),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Accounting update failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to save accounting inputs.' },
      { status: 500 },
    );
  }
}
