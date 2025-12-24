// app/dashboard/reports/open-house/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

type OpenHouseLead = {
  id: string;
  property_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  working_with_agent: string | null; // 'Yes' | 'No' | null
  created_at: string | null;
};

type PropertyStat = {
  propertyName: string;
  count: number;
  firstDate: string | null;
  lastDate: string | null;
};

type DateFilterType = 'all' | 'today' | 'last7' | 'month' | 'custom';

export default function OpenHouseReportsPage() {
  const [leads, setLeads] = useState<OpenHouseLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [customStart, setCustomStart] = useState<string>(''); // yyyy-mm-dd
  const [customEnd, setCustomEnd] = useState<string>(''); // yyyy-mm-dd

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/admin/open-house');
        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error || 'Failed to load open house leads from API.'
          );
        }

        setLeads(data.leads || []);
      } catch (err: any) {
        console.error(err);
        setError(
          err.message ||
            'Failed to load open house leads. Make sure the open_house_leads table exists and matches the expected schema.'
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Distinct properties from all leads
  const uniqueProperties = useMemo(() => {
    const set = new Set<string>();
    for (const lead of leads) {
      if (lead.property_name) set.add(lead.property_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  // Property summary stats (all-time, not affected by filters)
  const propertyStats = useMemo<PropertyStat[]>(() => {
    const map = new Map<string, PropertyStat>();

    for (const lead of leads) {
      const p = lead.property_name || 'Unnamed Property';
      const created = lead.created_at ? new Date(lead.created_at) : null;

      if (!map.has(p)) {
        map.set(p, {
          propertyName: p,
          count: 0,
          firstDate: created ? created.toISOString() : null,
          lastDate: created ? created.toISOString() : null,
        });
      }

      const stat = map.get(p)!;
      stat.count += 1;

      if (created) {
        if (!stat.firstDate || created < new Date(stat.firstDate)) {
          stat.firstDate = created.toISOString();
        }
        if (!stat.lastDate || created > new Date(stat.lastDate)) {
          stat.lastDate = created.toISOString();
        }
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.propertyName.localeCompare(b.propertyName)
    );
  }, [leads]);

  const getDateRange = (): { start?: Date; end?: Date } => {
    const now = new Date();

    if (dateFilter === 'all') return {};

    if (dateFilter === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      return { start, end };
    }

    if (dateFilter === 'last7') {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);

      return { start, end };
    }

    if (dateFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (dateFilter === 'custom') {
      if (!customStart && !customEnd) return {};
      let start: Date | undefined;
      let end: Date | undefined;

      if (customStart) {
        start = new Date(customStart + 'T00:00:00');
      }
      if (customEnd) {
        end = new Date(customEnd + 'T23:59:59');
      }

      return { start, end };
    }

    return {};
  };

  // Leads filtered by property + search + date
  const filteredLeads = useMemo(() => {
    const { start, end } = getDateRange();

    return leads.filter(lead => {
      // Property filter
      if (propertyFilter !== 'all' && lead.property_name !== propertyFilter) {
        return false;
      }

      // Date filter
      if (start || end) {
        if (!lead.created_at) {
          return false;
        }
        const created = new Date(lead.created_at);
        if (Number.isNaN(created.getTime())) {
          return false;
        }
        if (start && created < start) return false;
        if (end && created > end) return false;
      }

      // Text search
      const text = (
        (lead.first_name || '') +
        ' ' +
        (lead.last_name || '') +
        ' ' +
        (lead.email || '') +
        ' ' +
        (lead.phone || '')
      )
        .toLowerCase()
        .trim();

      if (search && !text.includes(search.toLowerCase().trim())) {
        return false;
      }

      return true;
    });
  }, [leads, propertyFilter, search, dateFilter, customStart, customEnd]);

  const totalVisitors = filteredLeads.length;
  const totalPropertiesFiltered = useMemo(
    () => new Set(filteredLeads.map(l => l.property_name)).size,
    [filteredLeads]
  );

  const exportCsv = () => {
    if (filteredLeads.length === 0) return;

    const header =
      'Property,First Name,Last Name,Email,Phone,Working With Agent,Signed At\n';

    const rows = filteredLeads.map(lead => {
      const property = lead.property_name || '';
      const first = lead.first_name || '';
      const last = lead.last_name || '';
      const email = lead.email || '';
      const phone = lead.phone || '';
      const working = lead.working_with_agent || '';
      const signedAt = lead.created_at
        ? new Date(lead.created_at).toLocaleString()
        : '';

      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [
        esc(property),
        esc(first),
        esc(last),
        esc(email),
        esc(phone),
        esc(working),
        esc(signedAt),
      ].join(',');
    });

    const csv = header + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const baseName =
      propertyFilter !== 'all'
        ? propertyFilter.replace(/[^a-z0-9\-]+/gi, '_')
        : 'open_house_all_properties';

    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_signins.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };

  const handleDateFilterChange = (value: DateFilterType) => {
    setDateFilter(value);
    if (value !== 'custom') {
      setCustomStart('');
      setCustomEnd('');
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const allIds = filteredLeads.map(l => l.id);
      const allSelected = allIds.every(id => prev.has(id));

      if (allSelected) {
        // Deselect all filtered
        const next = new Set(prev);
        allIds.forEach(id => next.delete(id));
        return next;
      }

      // Select all filtered (merge with previous selection)
      const next = new Set(prev);
      allIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const idsToDelete = filteredLeads
      .map(l => l.id)
      .filter(id => selectedIds.has(id));

    if (idsToDelete.length === 0) return;

    const confirm = window.confirm(
      `Delete ${idsToDelete.length} selected sign-in(s) from admin records? This cannot be undone, but will NOT affect any local data stored in the mobile app.`
    );
    if (!confirm) return;

    try {
      setDeleting(true);
      setError(null);

      const res = await fetch('/api/admin/open-house', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || 'Failed to delete selected open house leads.'
        );
      }

      // Remove deleted leads from local state
      setLeads(prev => prev.filter(l => !idsToDelete.includes(l.id)));
      setSelectedIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
    } catch (err: any) {
      console.error(err);
      setError(
        err.message ||
          'Failed to delete selected leads. Please try again or check your API route.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const anySelectedInFiltered = filteredLeads.some(l => selectedIds.has(l.id));
  const allSelectedInFiltered =
    filteredLeads.length > 0 &&
    filteredLeads.every(l => selectedIds.has(l.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-slate-50">
          Open House Sign-ins
        </h1>
        <p className="text-xs text-slate-400">
          Visitors who signed in at Open Houses, as captured in the mobile app.
          You can filter by property, date range, and search by name/email/phone,
          then export a CSV for follow-up. Even if agents delete their local
          Open House files in the app, these admin records remain here unless
          you explicitly delete them.
        </p>
      </div>

      {/* Summary + filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Total Visitors (filtered)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-50">
              {loading ? '—' : totalVisitors}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Properties (filtered)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-50">
              {loading ? '—' : totalPropertiesFiltered}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Distinct Properties (all time)
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-50">
              {loading ? '—' : uniqueProperties.length}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Left: property + date filters */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            {/* Property filter */}
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              value={propertyFilter}
              onChange={e => setPropertyFilter(e.target.value)}
            >
              <option value="all">All properties</option>
              {uniqueProperties.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            {/* Date filter presets */}
            <div className="flex flex-wrap gap-1">
              {[
                { value: 'all', label: 'All time' },
                { value: 'today', label: 'Today' },
                { value: 'last7', label: 'Last 7 days' },
                { value: 'month', label: 'This month' },
                { value: 'custom', label: 'Custom' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    handleDateFilterChange(opt.value as DateFilterType)
                  }
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
                    dateFilter === opt.value
                      ? 'bg-amber-400 text-slate-900 border-amber-300'
                      : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-amber-400/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Custom range inputs */}
            {dateFilter === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-1">
                  <span>From</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span>To</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: search + export + delete */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              type="text"
              placeholder="Search by name, email, or phone…"
              className="w-full md:w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={exportCsv}
                disabled={filteredLeads.length === 0}
                className="inline-flex items-center justify-center rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-amber-300 disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                disabled={!anySelectedInFiltered || deleting}
                onClick={handleDeleteSelected}
                className="inline-flex items-center justify-center rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-slate-50 shadow-sm hover:bg-red-400 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Selected'}
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

      {/* Property summary table (all time) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Properties Overview (all time)
          </div>
          <div className="text-[11px] text-slate-500">
            Click a property row to toggle the filter for the visitor list
            below.
          </div>
        </div>

        {propertyStats.length === 0 && !loading && (
          <div className="text-xs text-slate-500">
            No properties have recorded open house sign-ins yet.
          </div>
        )}

        {propertyStats.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2 font-medium">Property</th>
                  <th className="px-2 py-2 font-medium">Visitors</th>
                  <th className="px-2 py-2 font-medium">First Sign-in</th>
                  <th className="px-2 py-2 font-medium">Last Sign-in</th>
                </tr>
              </thead>
              <tbody>
                {propertyStats.map(stat => {
                  const isActive =
                    propertyFilter !== 'all' &&
                    propertyFilter === stat.propertyName;

                  return (
                    <tr
                      key={stat.propertyName}
                      className={`border-b border-slate-800 last:border-0 cursor-pointer ${
                        isActive ? 'bg-slate-800/70' : 'hover:bg-slate-800/40'
                      }`}
                      onClick={() =>
                        setPropertyFilter(
                          isActive ? 'all' : stat.propertyName
                        )
                      }
                    >
                      <td className="px-2 py-2 text-slate-100">
                        {stat.propertyName}
                      </td>
                      <td className="px-2 py-2 text-slate-100">
                        {stat.count}
                      </td>
                      <td className="px-2 py-2 text-slate-400">
                        {formatDate(stat.firstDate)}
                      </td>
                      <td className="px-2 py-2 text-slate-400">
                        {formatDate(stat.lastDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Visitor details table (filtered) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 text-xs text-slate-400">
          {loading
            ? 'Loading open house leads…'
            : filteredLeads.length === 0
            ? 'No open house sign-ins match your current filters.'
            : `Showing ${filteredLeads.length} visitor(s).`}
        </div>

        {!loading && filteredLeads.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2 font-medium">
                    <input
                      type="checkbox"
                      checked={allSelectedInFiltered}
                      onChange={toggleSelectAllFiltered}
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Property</th>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Phone</th>
                  <th className="px-2 py-2 font-medium">Working w/ Agent</th>
                  <th className="px-2 py-2 font-medium">Signed At</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(lead => {
                  const name = (
                    (lead.first_name || '') +
                    ' ' +
                    (lead.last_name || '')
                  ).trim();
                  const signedAt = lead.created_at
                    ? new Date(lead.created_at).toLocaleString()
                    : '—';
                  const isChecked = selectedIds.has(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-800 last:border-0"
                    >
                      <td className="px-2 py-2 text-slate-100">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(lead.id)}
                        />
                      </td>
                      <td className="px-2 py-2 text-slate-100">
                        {lead.property_name || '—'}
                      </td>
                      <td className="px-2 py-2 text-slate-200">
                        {name || '—'}
                      </td>
                      <td className="px-2 py-2 text-slate-200">
                        {lead.email || '—'}
                      </td>
                      <td className="px-2 py-2 text-slate-200">
                        {lead.phone || '—'}
                      </td>
                      <td className="px-2 py-2 text-slate-200">
                        {lead.working_with_agent || '—'}
                      </td>
                      <td className="px-2 py-2 text-slate-400">{signedAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
