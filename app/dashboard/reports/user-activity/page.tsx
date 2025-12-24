'use client';

import React, { useEffect, useMemo, useState } from 'react';

type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'past_due' | 'canceled' | 'unknown';
type PlanType = 'paid' | 'free' | 'all';

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;

  subscription_status: SubscriptionStatus;
  plan_type: 'paid' | 'free';
  subscription_plan: string | null;

  last_login_at: string | null;

  device_type: string | null;
  os_name: string | null;
  os_version: string | null;

  open_house_count: number;

  months_active: number;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  page: number;
  pageSize: number;
  totalApprox: number | null; // from auth admin listUsers, may be null
  users: UserRow[];
};

const STATUS_OPTIONS: { value: SubscriptionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'trial', label: 'Trial' },
  { value: 'past_due', label: 'Past Due' },
  { value: 'canceled', label: 'Cancelled' },
  { value: 'unknown', label: 'Unknown' },
];

export default function UserActivityReportsPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<PlanType>('all');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [sortBy, setSortBy] = useState<
    'name' | 'email' | 'last_login_at' | 'open_house_count' | 'months_active'
  >('last_login_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [totalApprox, setTotalApprox] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('status', statusFilter);
      params.set('plan', planFilter);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/admin/user-activity?${params.toString()}`);
      const data = (await res.json()) as ApiResponse;

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load user activity.');
      }

      setRows(data.users || []);
      setTotalApprox(data.totalApprox ?? null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to load user activity report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter, planFilter, sortBy, sortDir]);

  const filteredClientSide = useMemo(() => {
    // Server does filtering; this only applies the text search to current page for quick UX.
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();

    return rows.filter(r => {
      const text = `${r.first_name || ''} ${r.last_name || ''} ${r.email || ''} ${r.phone || ''}`
        .toLowerCase()
        .trim();
      return text.includes(q);
    });
  }, [rows, search]);

  const toggleSort = (key: typeof sortBy) => {
    if (sortBy !== key) {
      setSortBy(key);
      setSortDir('desc');
      setPage(1);
      return;
    }
    setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'));
    setPage(1);
  };

  const exportCsv = () => {
    if (filteredClientSide.length === 0) return;

    const header =
      'First Name,Last Name,Email,Phone,Subscription Status,Plan Type,Last Login,Device Type,OS,Open Houses,Months Active\n';

    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

    const lines = filteredClientSide.map(u => {
      const os = [u.os_name || '', u.os_version || ''].filter(Boolean).join(' ');
      return [
        esc(u.first_name || ''),
        esc(u.last_name || ''),
        esc(u.email || ''),
        esc(u.phone || ''),
        esc(u.subscription_status || ''),
        esc(u.plan_type || ''),
        esc(u.last_login_at ? new Date(u.last_login_at).toLocaleString() : ''),
        esc(u.device_type || ''),
        esc(os),
        esc(String(u.open_house_count ?? 0)),
        esc(String(u.months_active ?? 0)),
      ].join(',');
    });

    const csv = header + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `user_activity_${statusFilter}_${planFilter}_p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = rows.filter(r => r.subscription_status === 'active').length;
  const trialCount = rows.filter(r => r.subscription_status === 'trial').length;
  const pastDueCount = rows.filter(r => r.subscription_status === 'past_due').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base font-semibold text-slate-50">User Activity</h1>
        <p className="text-xs text-slate-400">
          All users with subscription status, plan type (paid/free), last login, device/OS, open house totals, and months active.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Users (this page)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-50">
              {loading ? '—' : rows.length}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Active (this page)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-50">
              {loading ? '—' : activeCount}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Trial (this page)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-50">
              {loading ? '—' : trialCount}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Past Due (this page)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-50">
              {loading ? '—' : pastDueCount}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              value={planFilter}
              onChange={e => {
                setPlanFilter(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="all">All Plans</option>
              <option value="paid">Paid</option>
              <option value="free">Free</option>
            </select>

            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              type="text"
              placeholder="Search name, email, phone…"
              className="w-full md:w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setPage(1);
                  fetchData();
                }
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  fetchData();
                }}
                className="inline-flex items-center justify-center rounded-full bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-50 hover:bg-slate-600"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredClientSide.length === 0}
                className="inline-flex items-center justify-center rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-amber-300 disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {loading
              ? 'Loading users…'
              : filteredClientSide.length === 0
              ? 'No users match your filters.'
              : `Showing ${filteredClientSide.length} user(s) on this page.`}
          </div>

          <div className="text-[11px] text-slate-500">
            {totalApprox ? `Total (approx): ${totalApprox}` : ''}
          </div>
        </div>

        {!loading && filteredClientSide.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2 font-medium cursor-pointer" onClick={() => toggleSort('name')}>
                    Name {sortBy === 'name' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th className="px-2 py-2 font-medium cursor-pointer" onClick={() => toggleSort('email')}>
                    Email {sortBy === 'email' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th className="px-2 py-2 font-medium">Phone</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Plan</th>
                  <th className="px-2 py-2 font-medium cursor-pointer" onClick={() => toggleSort('last_login_at')}>
                    Last Login {sortBy === 'last_login_at' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th className="px-2 py-2 font-medium">Device</th>
                  <th className="px-2 py-2 font-medium">OS</th>
                  <th className="px-2 py-2 font-medium cursor-pointer" onClick={() => toggleSort('open_house_count')}>
                    Open Houses {sortBy === 'open_house_count' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th className="px-2 py-2 font-medium cursor-pointer" onClick={() => toggleSort('months_active')}>
                    Months Active {sortBy === 'months_active' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClientSide.map(u => {
                  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—';
                  const os = [u.os_name || '', u.os_version || ''].filter(Boolean).join(' ') || '—';
                  const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—';

                  return (
                    <tr key={u.id} className="border-b border-slate-800 last:border-0">
                      <td className="px-2 py-2 text-slate-100">{name}</td>
                      <td className="px-2 py-2 text-slate-200">{u.email || '—'}</td>
                      <td className="px-2 py-2 text-slate-200">{u.phone || '—'}</td>
                      <td className="px-2 py-2 text-slate-200">{u.subscription_status || 'unknown'}</td>
                      <td className="px-2 py-2 text-slate-200">{u.plan_type}</td>
                      <td className="px-2 py-2 text-slate-400">{lastLogin}</td>
                      <td className="px-2 py-2 text-slate-200">{u.device_type || '—'}</td>
                      <td className="px-2 py-2 text-slate-200">{os}</td>
                      <td className="px-2 py-2 text-slate-200">{u.open_house_count}</td>
                      <td className="px-2 py-2 text-slate-200">{u.months_active}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          >
            Prev
          </button>

          <div className="text-xs text-slate-400">
            Page <span className="text-slate-200">{page}</span>
          </div>

          <button
            type="button"
            disabled={loading || rows.length < pageSize}
            onClick={() => setPage(p => p + 1)}
            className="rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
