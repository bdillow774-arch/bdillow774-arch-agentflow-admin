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

const MONTHLY_PRICE = 29.99; // change this to your actual subscription price

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
  const [openHouseLeads, setOpenHouseLeads] = useState<OpenHouseLeadRow[]>(
    [],
  );
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
        try {
          const { data: sessionsData, error: sessionsErr } = await supabase
            .from(OPEN_HOUSE_SESSIONS_TABLE)
            .select('id, property_name, created_at');

          if (sessionsErr) {
            console.warn(
              'Overview: open_house_sessions error',
              sessionsErr,
            );
            setOpenHouseError(
              `Could not load Open House sessions from "${OPEN_HOUSE_SESSIONS_TABLE}".`,
            );
            setOpenHouseSessions([]);
          } else {
            setOpenHouseSessions(
              (sessionsData || []) as OpenHouseSessionRow[],
            );
          }
        } catch (e) {
          console.warn(
            'Overview: unexpected error loading open_house_sessions',
            e,
          );
          setOpenHouseError(
            `Could not load Open House sessions from "${OPEN_HOUSE_SESSIONS_TABLE}".`,
          );
          setOpenHouseSessions([]);
        }

        // --- Open House Leads (sign-ins) ---
        try {
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
        } catch (e) {
          console.warn(
            'Overview: unexpected error loading open_house_leads',
            e,
          );
          setOpenHouseError(prev =>
            prev
              ? prev +
                ` Also could not load leads from "${OPEN_HOUSE_LEADS_TABLE}".`
              : `Could not load Open House leads from "${OPEN_HOUSE_LEADS_TABLE}".`,
          );
          setOpenHouseLeads([]);
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
    const atype = (u.account_type as AccountType) || 'free';
    const status =
      (u.subscription_status as SubscriptionStatus) || 'inactive';
    return atype === 'trial' && (status === 'trial' || status === 'active');
  }).length;

  const activePaid = users.filter(u => {
    const atype = (u.account_type as AccountType) || 'free';
    const status =
      (u.subscription_status as SubscriptionStatus) || 'inactive';
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
    if (Number.isNaN(created.getTime())) return false;
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return diffMs <= sevenDaysMs && diffMs >= 0;
  }).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold tracking-wide">
              AgentFlow Overview
            </h1>
            <p className="text-[11px] text-slate-400">
              High-level snapshot of app usage, trials, revenue, and Open
              House activity.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        {error && (
          <div className="mb-4 rounded-lg border border-red-700 bg-red-900/25 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}

        {/* Top stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total users */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <div className="text-[11px] text-slate-400 mb-1">
              Total Users
            </div>
            <div className="text-2xl font-semibold text-slate-50 mb-1">
              {state === 'loading' ? '…' : totalUsers}
            </div>
            <div className="text-[11px] text-slate-500">
              All accounts that have been created in AgentFlow.
            </div>
          </div>

          {/* Active trials */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <div className="text-[11px] text-slate-400 mb-1">
              Active Trials
            </div>
            <div className="text-2xl font-semibold text-blue-300 mb-1">
              {state === 'loading' ? '…' : activeTrials}
            </div>
            <div className="text-[11px] text-slate-500">
              Users currently in trial or in trial status.
            </div>
          </div>

          {/* Active paid */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <div className="text-[11px] text-slate-400 mb-1">
              Active Paid Accounts
            </div>
            <div className="text-2xl font-semibold text-emerald-300 mb-1">
              {state === 'loading' ? '…' : activePaid}
            </div>
            <div className="text-[11px] text-slate-500">
              Accounts marked as paid and active.
            </div>
          </div>

          {/* Estimated monthly revenue */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <div className="text-[11px] text-slate-400 mb-1">
              Est. Monthly Revenue
            </div>
            <div className="text-2xl font-semibold text-amber-300 mb-1">
              {state === 'loading'
                ? '…'
                : `$${estimatedMonthlyRevenue.toFixed(2)}`}
            </div>
            <div className="text-[11px] text-slate-500">
              Based on {activePaid} paid accounts at ${MONTHLY_PRICE.toFixed(
                2,
              )}
              /month.
            </div>
          </div>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Open house activity */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[11px] text-slate-400 mb-1">
                  Open House Activity
                </div>
                <div className="text-lg font-semibold text-slate-50">
                  {state === 'loading'
                    ? '…'
                    : `${totalOpenHouseSignins} sign-ins`}
                </div>
              </div>
              <Link
                href="/dashboard/open-house"
                className="text-[11px] text-sky-400 hover:text-sky-300"
              >
                View Open House Reports →
              </Link>
            </div>

            {openHouseError && (
              <div className="mb-2 rounded-md border border-amber-600 bg-amber-900/20 px-2 py-1 text-[11px] text-amber-100">
                {openHouseError}
              </div>
            )}

            <div className="text-[11px] text-slate-500 mb-1">
              Total sessions:{' '}
              <span className="text-slate-200">
                {state === 'loading' ? '…' : totalOpenHouseSessions}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mb-1">
              Unique properties with sign-ins:{' '}
              <span className="text-slate-200">
                {state === 'loading' ? '…' : uniqueOpenHouseProperties}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Sessions come from{' '}
              <span className="font-mono text-[10px]">
                {OPEN_HOUSE_SESSIONS_TABLE}
              </span>
              {'  '}and sign-ins from{' '}
              <span className="font-mono text-[10px]">
                {OPEN_HOUSE_LEADS_TABLE}
              </span>
              . Each session can generate downloadable files in the Open
              House dashboard.
            </p>
          </div>

          {/* New users */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <div className="text-[11px] text-slate-400 mb-1">
              New Users (Last 7 Days)
            </div>
            <div className="text-2xl font-semibold text-slate-50 mb-1">
              {state === 'loading' ? '…' : newUsersLast7Days}
            </div>
            <p className="text-[11px] text-slate-500">
              Users created within the last 7 days based on{' '}
              <span className="font-mono text-[10px]">users.created_at</span>.
            </p>
          </div>

          {/* Quick links */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
            <div className="text-[11px] text-slate-400 mb-2">
              Quick Admin Actions
            </div>
            <div className="flex flex-col gap-2 text-[11px]">
              <Link
                href="/dashboard/users"
                className="inline-flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 hover:border-sky-500 hover:bg-slate-900"
              >
                <span>Manage Users</span>
                <span className="text-sky-400">→</span>
              </Link>
              <Link
                href="/dashboard/promotions"
                className="inline-flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 hover:border-sky-500 hover:bg-slate-900"
              >
                <span>Promotions & Free Trials</span>
                <span className="text-sky-400">→</span>
              </Link>
              <Link
                href="/dashboard/open-house"
                className="inline-flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 hover:border-sky-500 hover:bg-slate-900"
              >
                <span>Open House Sign-ins</span>
                <span className="text-sky-400">→</span>
              </Link>
            </div>
          </div>
        </div>

        {state === 'loading' && (
          <p className="text-[11px] text-slate-500">
            Loading overview data…
          </p>
        )}
      </div>
    </div>
  );
}
