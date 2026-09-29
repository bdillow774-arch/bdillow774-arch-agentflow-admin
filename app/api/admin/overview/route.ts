import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

type AccountType = 'free' | 'trial' | 'paid';
type SubscriptionStatus =
  | 'inactive'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'canceled';

const MONTHLY_PRICE = 4.99;

type UserRow = {
  id: string;
  email: string | null;
  account_type?: AccountType | null;
  subscription_status?: SubscriptionStatus | null;
  created_at?: string | null;
};

type OpenHouseRow = {
  id: string;
  property_name?: string | null;
  session_id?: string | null;
  created_at?: string | null;
};

export async function GET() {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const [
      usersResult,
      sessionsResult,
      leadsResult,
      promotionSettingsResult,
    ] = await Promise.all([
      supabaseAdminClient
        .from('users')
        .select('id, email, account_type, subscription_status, created_at')
        .order('created_at', { ascending: false }),
      supabaseAdminClient
        .from('open_house_sessions')
        .select('id, property_name, created_at'),
      supabaseAdminClient
        .from('open_house_leads')
        .select('id, session_id, created_at'),
      supabaseAdminClient
        .from('promotion_settings')
        .select(
          'id, free_trial_enabled, free_trial_length_days, created_at, updated_at',
        )
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (usersResult.error) {
      throw usersResult.error;
    }

    const warnings: string[] = [];

    const users = (usersResult.data ?? []) as UserRow[];
    const openHouseSessions = sessionsResult.error
      ? []
      : ((sessionsResult.data ?? []) as OpenHouseRow[]);
    const rawOpenHouseLeads = leadsResult.error
      ? []
      : ((leadsResult.data ?? []) as OpenHouseRow[]);
    const sessionPropertyMap = new Map(
      openHouseSessions.map((session) => [
        session.id,
        session.property_name ?? null,
      ]),
    );
    const openHouseLeads = rawOpenHouseLeads.map((lead) => ({
      ...lead,
      property_name: lead.session_id
        ? sessionPropertyMap.get(lead.session_id) ?? null
        : null,
    }));

    if (sessionsResult.error) {
      warnings.push(
        `Open house sessions unavailable: ${sessionsResult.error.message}`,
      );
    }

    if (leadsResult.error) {
      warnings.push(`Open house leads unavailable: ${leadsResult.error.message}`);
    }

    if (promotionSettingsResult.error) {
      warnings.push(
        `Promotion settings unavailable: ${promotionSettingsResult.error.message}`,
      );
    }

    const totalUsers = users.length;
    const activeTrials = users.filter((user) => {
      const accountType = user.account_type ?? 'free';
      const subscriptionStatus = user.subscription_status ?? 'inactive';
      return (
        accountType === 'trial' &&
        (subscriptionStatus === 'trial' || subscriptionStatus === 'active')
      );
    }).length;

    const activePaid = users.filter((user) => {
      const accountType = user.account_type ?? 'free';
      const subscriptionStatus = user.subscription_status ?? 'inactive';
      return accountType === 'paid' && subscriptionStatus === 'active';
    }).length;

    const newUsersLast7Days = users.filter((user) => {
      if (!user.created_at) return false;
      const created = new Date(user.created_at);
      if (Number.isNaN(created.getTime())) return false;
      const diffMs = Date.now() - created.getTime();
      return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
    }).length;

    const uniqueOpenHouseProperties = new Set(
      openHouseLeads
        .map((lead) => (lead.property_name ?? '').trim())
        .filter(Boolean),
    ).size;

    await logAdminAudit({
      action: 'read',
      resourceType: 'overview',
      actor: auth.user,
      details: {
        totalUsers,
        activeTrials,
        activePaid,
        totalOpenHouseSignins: openHouseLeads.length,
      },
    });

    return NextResponse.json({
      ok: true,
      summary: {
        totalUsers,
        activeTrials,
        activePaid,
        estimatedMonthlyRevenue: Number((activePaid * MONTHLY_PRICE).toFixed(2)),
        monthlyPrice: MONTHLY_PRICE,
        totalOpenHouseSessions: openHouseSessions.length,
        totalOpenHouseSignins: openHouseLeads.length,
        uniqueOpenHouseProperties,
        newUsersLast7Days,
      },
      promotionSettings: promotionSettingsResult.data ?? null,
      recentUsers: users.slice(0, 8),
      warnings,
    });
  } catch (error: any) {
    console.error('Admin overview load failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to load overview.' },
      { status: 500 },
    );
  }
}
