'use client';

import React, { useEffect, useState } from 'react';
import { supabaseBrowserClient } from '@/lib/supabaseClient';
import Link from 'next/link';

type AccountType = 'free' | 'trial' | 'paid';
type SubscriptionStatus =
  | 'inactive'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'canceled';

type UserRow = {
  id: string;
  email: string | null;
  account_type?: AccountType | null;
  subscription_status?: SubscriptionStatus | null;
  created_at?: string | null;
};

type OpenHouseSessionRow = {
  id: string;
  property_name?: string | null;
  created_at?: string | null;
};

type OpenHouseLeadRow = {
  id: string;
  property_name?: string | null;
  created_at?: string | null;
};

type State = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * ✅ AgentFlow production pricing
 * Must match RevenueCat offering
 */
const MONTHLY_PRICE = 4.99;

// 👇 Your actual table names
const OPEN_HOUSE_SESSIONS_TABLE = 'open_house_sessions';
const OPEN_HOUSE_LEADS_TABLE = 'open_house_leads';

export default function DashboardOverviewPage() {
  const supabase = supabaseBrowserClient;

  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [openHouseSessions, setOpenHouseSessions] = useState<
    OpenHouseSessionRow[]
  >([]);
  const [openHouseLeads, setOpenHouseLeads] = useState<OpenHouseLeadRow[]>([]);
  const [openHouseError, setOpenHouseError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setState('loading');
      setError(null);
      setOpenHouseError(null);

      try {
        // --- Users ---
        const { data: usersData, error: usersErr } = await supabase
          .from('users')
          .select('id, email, account_type, subscription_status, created_at');

        if (usersErr) {
          console.error('Overview: users error', usersErr);
          setError(
            'Could not load users. Make sure the "users" table exists.',
          );
          setState('error');
          return;
        }

        setUsers((usersData || []) as UserRow[]);

        // --- Open House Sessions ---
        const { data: sessionsData, error: sessionsErr } = await supabase
          .from(OPEN_HOUSE_SESSIONS_TABLE)
          .select('id, property_name, created_at');

        if (sessionsErr) {
          console.warn('Overview: open_house_sessions error', sessionsErr);
          setOpenHouseError(
            `Could not load Open House sessions from "${OPEN_HOUSE_SESSIONS_TABLE}".`,
          );
          setOpenHouseSessions([]);
        } else {
          setOpenHouseSessions(
            (sessionsData || []) as OpenHouseSessionRow[],
          );
        }

        // --- Open House Leads ---
        const { data: leadsData, error: leadsErr } = await supabase
          .from(OPEN_HOUSE_LEADS_TABLE)
          .select('id, property_name, created_at');

        if (leadsErr) {
          console.warn('Overview: open_house_leads error', leadsErr);
          setOpenHouseError(prev =>
            prev
              ? prev +
                ` Also could not load leads from "${OPEN_HOUSE_LEADS_TABLE}".`
              : `Could not load Open House leads from "${OPEN_HOUSE_LEADS_TABLE}".`,
          );
          setOpenHouseLeads([]);
        } else {
          setOpenHouseLeads((leadsData || []) as OpenHouseLeadRow[]);
        }

        setState('loaded');
      } catch (e) {
        console.error('Overview: unexpected error', e);
        setError('Unexpected error loading overview data.');
        setState('error');
      }
    };

    loadData();
  }, [supabase]);

  // ---- Derived metrics ----
  const totalUsers = users.length;

  const activeTrials = users.filter(u => {
    const atype = u.account_type || 'free';
    const status = u.subscription_status || 'inactive';
    return atype === 'trial' && (status === 'trial' || status === 'active');
  }).length;

  const activePaid = users.filter(u => {
    const atype = u.account_type || 'free';
    const status = u.subscription_status || 'inactive';
    return atype === 'paid' && status === 'active';
  }).length;

  const estimatedMonthlyRevenue = activePaid * MONTHLY_PRICE;

  const totalOpenHouseSessions = openHouseSessions.length;
  const totalOpenHouseSignins = openHouseLeads.length;

  const uniqueOpenHouseProperties = Array.from(
    new Set(
      openHouseLeads
        .map(r => (r.property_name || '').trim())
        .filter(Boolean),
    ),
  ).length;

  const newUsersLast7Days = users.filter(u => {
    if (!u.created_at) return false;
    const created = new Date(u.created_at);
    const diffMs = Date.now() - created.getTime();
    return diffMs <= 7 * 24 * 60 * 60 * 1000 && diffMs >= 0;
  }).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <h1 className="text-sm font-semibold tracking-wide">
            AgentFlow Overview
          </h1>
          <p className="text-[11px] text-slate-400">
            High-level snapshot of app usage, trials, revenue, and Open House
            activity.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Users" value={totalUsers} />
          <StatCard label="Active Trials" value={activeTrials} color="blue" />
          <StatCard label="Active Paid Accounts" value={activePaid} color="emerald" />
          <StatCard
            label="Est. Monthly Revenue"
            value={`$${estimatedMonthlyRevenue.toFixed(2)}`}
            color="amber"
            subtext={`Based on ${activePaid} paid accounts at $${MONTHLY_PRICE.toFixed(
              2,
            )}/month`}
          />
        </div>

        {/* Secondary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <div className="text-sm font-semibold mb-1">
              Open House Activity
            </div>
            <div className="text-xs text-slate-400 mb-2">
              {totalOpenHouseSignins} sign-ins • {totalOpenHouseSessions} sessions
            </div>
            <Link
              href="/dashboard/open-house"
              className="text-xs text-sky-400"
            >
              View Open House Reports →
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <div className="text-sm font-semibold mb-1">
              New Users (Last 7 Days)
            </div>
            <div className="text-2xl font-semibold">
              {newUsersLast7Days}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <div className="text-sm font-semibold mb-2">
              Quick Admin Actions
            </div>
            <Link href="/dashboard/users" className="text-xs text-sky-400">
              Manage Users →
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
  color,
  subtext,
}: {
  label: string;
  value: React.ReactNode;
  color?: 'blue' | 'emerald' | 'amber';
  subtext?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${colorMap[color || ''] || ''}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-[11px] text-slate-500 mt-1">{subtext}</div>
      )}
    </div>
  );
}
