'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type OverviewResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    totalUsers: number;
    activeTrials: number;
    activePaid: number;
    estimatedMonthlyRevenue: number;
    monthlyPrice: number;
    totalOpenHouseSessions: number;
    totalOpenHouseSignins: number;
    uniqueOpenHouseProperties: number;
    newUsersLast7Days: number;
    brokerageCount: number;
    brokerageSeatsSold: number;
    assignedBrokerageSeats: number;
    activeBrokerageSubscriptions: number;
  };
  promotionSettings?: {
    free_trial_enabled: boolean;
    free_trial_length_days: number;
  } | null;
  warnings?: string[];
};

const EMPTY_SUMMARY = {
  totalUsers: 0,
  activeTrials: 0,
  activePaid: 0,
  estimatedMonthlyRevenue: 0,
  monthlyPrice: 4.99,
  totalOpenHouseSessions: 0,
  totalOpenHouseSignins: 0,
  uniqueOpenHouseProperties: 0,
  newUsersLast7Days: 0,
  brokerageCount: 0,
  brokerageSeatsSold: 0,
  assignedBrokerageSeats: 0,
  activeBrokerageSubscriptions: 0,
};

export default function OverviewDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [promotionSettings, setPromotionSettings] =
    useState<OverviewResponse['promotionSettings']>(null);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/admin/overview', {
          cache: 'no-store',
        });
        const data = (await response.json()) as OverviewResponse;

        if (!response.ok || !data.ok || !data.summary) {
          throw new Error(data.error || 'Failed to load dashboard overview.');
        }

        setSummary(data.summary);
        setWarnings(data.warnings ?? []);
        setPromotionSettings(data.promotionSettings ?? null);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || 'Failed to load dashboard overview.');
      } finally {
        setLoading(false);
      }
    };

    void loadOverview();
  }, []);

  return (
    <div className="min-h-screen px-4 py-6 text-[#172033] lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7">
          <p className="text-sm font-semibold uppercase text-[#2187e5]">
            AgentFlow Master Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[#172033] sm:text-4xl">
            Operational Overview
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Live snapshot of users, RevenueCat subscription status, brokerage
            seats, open-house activity, and promotion settings.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {warnings.join(' ')}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Users"
            value={loading ? '...' : summary.totalUsers}
          />
          <StatCard
            label="Active Trials"
            value={loading ? '...' : summary.activeTrials}
            color="blue"
          />
          <StatCard
            label="Active Paid Accounts"
            value={loading ? '...' : summary.activePaid}
            color="emerald"
          />
          <StatCard
            label="Est. Monthly Revenue"
            value={
              loading ? '...' : `$${summary.estimatedMonthlyRevenue.toFixed(2)}`
            }
            color="amber"
            subtext={`Based on ${summary.activePaid} paid accounts at $${summary.monthlyPrice.toFixed(2)}/month`}
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Brokerages"
            value={loading ? '...' : summary.brokerageCount}
            color="blue"
            subtext={`${summary.activeBrokerageSubscriptions} granting access`}
          />
          <StatCard
            label="Seats Sold"
            value={loading ? '...' : summary.brokerageSeatsSold}
            color="slate"
          />
          <StatCard
            label="Assigned Seats"
            value={loading ? '...' : summary.assignedBrokerageSeats}
            color="emerald"
          />
          <StatCard
            label="Individual Subscriptions"
            value={loading ? '...' : summary.activePaid}
            color="amber"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="af-card rounded-2xl p-5">
            <div className="mb-1 text-sm font-semibold">Open House Activity</div>
            <div className="text-sm text-slate-600">
              {loading
                ? 'Loading activity...'
                : `${summary.totalOpenHouseSignins} sign-ins across ${summary.totalOpenHouseSessions} sessions and ${summary.uniqueOpenHouseProperties} properties.`}
            </div>
            <Link
              href="/dashboard/reports/open-house"
              className="mt-3 inline-block text-sm font-medium text-[#2187e5]"
            >
              View Open House Reports
            </Link>
          </div>

          <div className="af-card rounded-2xl p-5">
            <div className="mb-1 text-sm font-semibold">New Users (Last 7 Days)</div>
            <div className="text-2xl font-semibold">
              {loading ? '...' : summary.newUsersLast7Days}
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Tracks recent account creation recorded in the AgentFlow users
              table.
            </div>
          </div>

          <div className="af-card rounded-2xl p-5">
            <div className="mb-2 text-sm font-semibold">Promotions Status</div>
            <div className="text-sm text-slate-600">
              {loading
                ? 'Loading promotion settings...'
                : promotionSettings
                  ? promotionSettings.free_trial_enabled
                    ? `Free trial is enabled for ${promotionSettings.free_trial_length_days} day(s).`
                    : 'Free trial is currently disabled.'
                  : 'No promotion settings row found yet.'}
            </div>
            <Link
              href="/dashboard/promotions"
              className="mt-3 inline-block text-sm font-medium text-[#2187e5]"
            >
              Manage Promotions
            </Link>
          </div>
        </div>

        <div className="af-card mt-4 rounded-2xl p-5">
          <div className="mb-2 text-sm font-semibold">Quick Admin Actions</div>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link
              href="/dashboard/users"
              className="rounded-full bg-[#eef7ff] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-sky-100"
            >
              Manage Users
            </Link>
            <Link
              href="/dashboard/brokerages"
              className="rounded-full bg-[#eef7ff] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-sky-100"
            >
              Manage Brokerages
            </Link>
            <Link
              href="/dashboard/reports/user-activity"
              className="rounded-full bg-[#eef7ff] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-sky-100"
            >
              User Activity
            </Link>
            <Link
              href="/dashboard/reports/open-house"
              className="rounded-full bg-[#eef7ff] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-sky-100"
            >
              Open House Reports
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'slate',
  subtext,
}: {
  label: string;
  value: string | number;
  color?: 'slate' | 'blue' | 'emerald' | 'amber';
  subtext?: string;
}) {
  const accents = {
    slate: 'border-slate-200 bg-white',
    blue: 'border-sky-200 bg-sky-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
  } as const;

  return (
    <div className={`rounded-2xl border px-5 py-5 shadow-sm ${accents[color]}`}>
      <div className="text-xs font-semibold uppercase text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {subtext && <div className="mt-2 text-[11px] text-slate-500">{subtext}</div>}
    </div>
  );
}
