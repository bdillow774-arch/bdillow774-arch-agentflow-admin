'use client';

import { useEffect, useMemo, useState } from 'react';

type MonthlyRow = {
  monthStart: string;
  grossRevenue: number;
  providerCounts: {
    apple: number;
    google: number;
    manual: number;
    none: number;
  };
  providerRevenue: {
    apple: number;
    google: number;
    manual: number;
    none: number;
  };
  costs: {
    appleFees: number;
    googleFees: number;
    manualProcessorFees: number;
    revenueCatFees: number;
    googleMapsFees: number;
  };
  googleMapsUsageCount: number;
  totalExpenses: number;
  netProfit: number;
};

type AccountingResponse = {
  ok: boolean;
  error?: string;
  warnings?: string[];
  monthlyPrice: number;
  monthly: MonthlyRow[];
  revenue: {
    activePaidUsers: number;
    grossRevenue: number;
    providerCounts: MonthlyRow['providerCounts'];
    providerRevenue: MonthlyRow['providerRevenue'];
  };
  totals: {
    totalExpenses: number;
    netProfit: number;
  };
};

type Inputs = {
  appleFees: string;
  googleFees: string;
  manualProcessorFees: string;
  revenueCatFees: string;
  googleMapsFees: string;
  googleMapsUsageCount: string;
};

const EMPTY_INPUTS: Inputs = {
  appleFees: '0',
  googleFees: '0',
  manualProcessorFees: '0',
  revenueCatFees: '0',
  googleMapsFees: '0',
  googleMapsUsageCount: '0',
};

export default function AccountingPage() {
  const [data, setData] = useState<AccountingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [inputs, setInputs] = useState<Inputs>(EMPTY_INPUTS);

  const loadAccounting = async (preferredMonth?: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/admin/accounting', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as AccountingResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to load accounting data.');
      }

      setData(payload);
      const fallbackMonth = preferredMonth || payload.monthly[0]?.monthStart || '';
      setSelectedMonth(fallbackMonth);

      const selected =
        payload.monthly.find((row) => row.monthStart === fallbackMonth) ??
        payload.monthly[0] ??
        null;

      setInputs(
        selected
          ? {
              appleFees: String(selected.costs.appleFees),
              googleFees: String(selected.costs.googleFees),
              manualProcessorFees: String(selected.costs.manualProcessorFees),
              revenueCatFees: String(selected.costs.revenueCatFees),
              googleMapsFees: String(selected.costs.googleMapsFees),
              googleMapsUsageCount: String(selected.googleMapsUsageCount ?? 0),
            }
          : EMPTY_INPUTS,
      );
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to load accounting data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounting();
  }, []);

  const selectedRow = useMemo(
    () => data?.monthly.find((row) => row.monthStart === selectedMonth) ?? data?.monthly[0] ?? null,
    [data, selectedMonth],
  );

  const computedSelected = useMemo(() => {
    if (!selectedRow) return null;

    const appleFees = safeNumber(inputs.appleFees);
    const googleFees = safeNumber(inputs.googleFees);
    const manualProcessorFees = safeNumber(inputs.manualProcessorFees);
    const revenueCatFees = safeNumber(inputs.revenueCatFees);
    const googleMapsFees = safeNumber(inputs.googleMapsFees);
    const totalExpenses =
      appleFees +
      googleFees +
      manualProcessorFees +
      revenueCatFees +
      googleMapsFees;

    return {
      appleFees,
      googleFees,
      manualProcessorFees,
      revenueCatFees,
      googleMapsFees,
      totalExpenses,
      netProfit: selectedRow.grossRevenue - totalExpenses,
    };
  }, [inputs, selectedRow]);

  const handleMonthChange = (monthStart: string) => {
    setSelectedMonth(monthStart);
    const row = data?.monthly.find((item) => item.monthStart === monthStart);

    if (!row) {
      setInputs(EMPTY_INPUTS);
      return;
    }

    setInputs({
      appleFees: String(row.costs.appleFees),
      googleFees: String(row.costs.googleFees),
      manualProcessorFees: String(row.costs.manualProcessorFees),
      revenueCatFees: String(row.costs.revenueCatFees),
      googleMapsFees: String(row.costs.googleMapsFees),
      googleMapsUsageCount: String(row.googleMapsUsageCount ?? 0),
    });
  };

  const handleSave = async () => {
    if (!selectedRow) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const response = await fetch('/api/admin/accounting', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthStart: selectedRow.monthStart,
          services: {
            apple_fees: { amount: safeNumber(inputs.appleFees) },
            google_fees: { amount: safeNumber(inputs.googleFees) },
            manual_processor_fees: {
              amount: safeNumber(inputs.manualProcessorFees),
            },
            revenuecat_fees: { amount: safeNumber(inputs.revenueCatFees) },
            google_maps: {
              amount: safeNumber(inputs.googleMapsFees),
              usageCount: safeNumber(inputs.googleMapsUsageCount),
            },
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to save monthly accounting costs.');
      }

      setMessage(`Saved monthly cost inputs for ${formatMonth(selectedRow.monthStart)}.`);
      await loadAccounting(selectedRow.monthStart);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to save monthly accounting costs.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Accounting
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Monthly income, Apple and Google fees, RevenueCat cost, Google Maps cost,
            processor fees, and profit. Revenue is estimated from subscription events
            when available and falls back to the current active paid snapshot for the
            current month.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {data?.warnings?.length ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {data.warnings.join(' ')}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Current Gross Income"
            value={loading || !data ? '...' : formatCurrency(data.revenue.grossRevenue)}
          />
          <MetricCard
            label="Current Expenses"
            value={loading || !data ? '...' : formatCurrency(data.totals.totalExpenses)}
            tone="amber"
          />
          <MetricCard
            label="Current Net Profit"
            value={loading || !data ? '...' : formatCurrency(data.totals.netProfit)}
            tone="emerald"
          />
          <MetricCard
            label="Active Paid Users"
            value={loading || !data ? '...' : String(data.revenue.activePaidUsers)}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Monthly Ledger</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Review revenue, cost, and net profit month by month.
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Month</th>
                    <th className="px-3 py-3 font-medium">Gross</th>
                    <th className="px-3 py-3 font-medium">Expenses</th>
                    <th className="px-3 py-3 font-medium">Profit</th>
                    <th className="px-3 py-3 font-medium">Maps</th>
                    <th className="px-3 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.monthly ?? []).map((row) => {
                    const isActive = row.monthStart === selectedRow?.monthStart;
                    return (
                      <tr key={row.monthStart} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3 text-slate-900">{formatMonth(row.monthStart)}</td>
                        <td className="px-3 py-3 text-slate-700">{formatCurrency(row.grossRevenue)}</td>
                        <td className="px-3 py-3 text-slate-700">{formatCurrency(row.totalExpenses)}</td>
                        <td className="px-3 py-3 text-slate-700">{formatCurrency(row.netProfit)}</td>
                        <td className="px-3 py-3 text-slate-700">
                          {formatCurrency(row.costs.googleMapsFees)}
                          <span className="ml-2 text-xs text-slate-500">
                            {row.googleMapsUsageCount} uses
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => handleMonthChange(row.monthStart)}
                            className={[
                              'rounded-full px-4 py-2 text-xs font-semibold',
                              isActive
                                ? 'bg-sky-500 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                            ].join(' ')}
                          >
                            {isActive ? 'Selected' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Monthly Cost Inputs
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Override or confirm actual monthly costs for the selected month.
                </p>
              </div>
              <select
                value={selectedRow?.monthStart ?? ''}
                onChange={(event) => handleMonthChange(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              >
                {(data?.monthly ?? []).map((row) => (
                  <option key={row.monthStart} value={row.monthStart}>
                    {formatMonth(row.monthStart)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 space-y-4">
              <InputRow
                label="Apple Fees"
                value={inputs.appleFees}
                onChange={(value) => setInputs((prev) => ({ ...prev, appleFees: value }))}
              />
              <InputRow
                label="Google Fees"
                value={inputs.googleFees}
                onChange={(value) => setInputs((prev) => ({ ...prev, googleFees: value }))}
              />
              <InputRow
                label="RevenueCat Fees"
                value={inputs.revenueCatFees}
                onChange={(value) => setInputs((prev) => ({ ...prev, revenueCatFees: value }))}
              />
              <InputRow
                label="Processor Fees"
                value={inputs.manualProcessorFees}
                onChange={(value) =>
                  setInputs((prev) => ({ ...prev, manualProcessorFees: value }))
                }
              />
              <InputRow
                label="Google Maps Cost"
                value={inputs.googleMapsFees}
                onChange={(value) => setInputs((prev) => ({ ...prev, googleMapsFees: value }))}
              />
              <InputRow
                label="Google Maps Usage Count"
                value={inputs.googleMapsUsageCount}
                onChange={(value) =>
                  setInputs((prev) => ({ ...prev, googleMapsUsageCount: value }))
                }
              />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <BreakdownRow
                label="Selected Month Gross"
                detail={selectedRow ? formatMonth(selectedRow.monthStart) : 'No month selected'}
                value={selectedRow ? formatCurrency(selectedRow.grossRevenue) : '...'}
              />
              <BreakdownRow
                label="Selected Month Profit"
                detail="After saved or modeled costs"
                value={computedSelected ? formatCurrency(computedSelected.netProfit) : '...'}
              />
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={!selectedRow || saving}
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Monthly Costs'}
              </button>
            </div>
          </section>
        </div>

        {selectedRow && (
          <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              {formatMonth(selectedRow.monthStart)} Revenue Breakdown
            </h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <BreakdownRow
                label="Apple Revenue"
                detail={`${selectedRow.providerCounts.apple} billings`}
                value={formatCurrency(selectedRow.providerRevenue.apple)}
              />
              <BreakdownRow
                label="Google Revenue"
                detail={`${selectedRow.providerCounts.google} billings`}
                value={formatCurrency(selectedRow.providerRevenue.google)}
              />
              <BreakdownRow
                label="Manual Revenue"
                detail={`${selectedRow.providerCounts.manual} billings`}
                value={formatCurrency(selectedRow.providerRevenue.manual)}
              />
              <BreakdownRow
                label="Unassigned Revenue"
                detail={`${selectedRow.providerCounts.none} billings`}
                value={formatCurrency(selectedRow.providerRevenue.none)}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'amber' | 'emerald';
}) {
  const tones = {
    slate: 'border-slate-200 bg-white',
    amber: 'border-amber-200 bg-amber-50',
    emerald: 'border-emerald-200 bg-emerald-50',
  } as const;

  return (
    <div className={`rounded-[28px] border p-5 shadow-sm ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  detail,
  value,
}: {
  label: string;
  detail: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
      <div className="mt-3 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function InputRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );
}

function safeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}
