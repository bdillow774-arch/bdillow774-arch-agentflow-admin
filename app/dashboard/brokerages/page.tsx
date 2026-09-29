'use client';

import { useEffect, useMemo, useState } from 'react';

type Brokerage = {
  id: string;
  name: string;
  primary_admin_email: string;
  primary_admin_name: string | null;
  plan_code: string;
  purchased_seats: number;
  monthly_price_cents: number;
  subscription_state: string;
  stripe_subscription_status: string | null;
  current_period_end: string | null;
  grace_period_ends_at: string | null;
  assigned_seats: number;
  available_seats: number;
  pending_agents: number;
  active_agents: number;
  active_join_code_preview: string | null;
};

const PLANS = [
  { code: 'seats_10', label: '10 agents', seats: 10, cents: 4999 },
  { code: 'seats_25', label: '25 agents', seats: 25, cents: 11999 },
  { code: 'seats_50', label: '50 agents', seats: 50, cents: 22499 },
  { code: 'seats_100', label: '100 agents', seats: 100, cents: 42499 },
  { code: 'seats_250', label: '250 agents', seats: 250, cents: 99999 },
];

const EMPTY_FORM = {
  name: '',
  primaryAdminEmail: '',
  primaryAdminName: '',
  planCode: 'seats_10',
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function dateLabel(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default function BrokeragesPage() {
  const [brokerages, setBrokerages] = useState<Brokerage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newJoinCode, setNewJoinCode] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.code === form.planCode) ?? PLANS[0],
    [form.planCode],
  );

  const loadBrokerages = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/admin/brokerages', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to load brokerages.');
      }

      setBrokerages(payload.brokerages ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load brokerages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBrokerages();
  }, []);

  const createBrokerage = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      setNewJoinCode(null);

      const response = await fetch('/api/admin/brokerages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          purchasedSeats: selectedPlan.seats,
          monthlyPriceCents: selectedPlan.cents,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to create brokerage.');
      }

      setForm(EMPTY_FORM);
      setNewJoinCode(payload.joinCode);
      setMessage('Brokerage created. Start Stripe Checkout before granting access.');
      await loadBrokerages();
    } catch (err: any) {
      setError(err?.message || 'Failed to create brokerage.');
    } finally {
      setSaving(false);
    }
  };

  const startCheckout = async (brokerageId: string) => {
    const response = await fetch('/api/admin/brokerages/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brokerageId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setError(payload.error || 'Failed to start checkout.');
      return;
    }
    window.location.href = payload.checkoutUrl;
  };

  const openPortal = async (brokerageId: string) => {
    const response = await fetch('/api/admin/brokerages/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brokerageId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setError(payload.error || 'Failed to open billing portal.');
      return;
    }
    window.location.href = payload.portalUrl;
  };

  const regenerateCode = async (brokerageId: string) => {
    const response = await fetch('/api/admin/brokerages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: brokerageId, action: 'regenerate_join_code' }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setError(payload.error || 'Failed to regenerate join code.');
      return;
    }
    setNewJoinCode(payload.joinCode);
    setMessage('Join code regenerated. Copy it now; only the preview is stored.');
    await loadBrokerages();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            AgentFlow
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Brokerage Subscriptions
          </h1>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}
        {newJoinCode && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            New join code: <span className="font-mono font-semibold">{newJoinCode}</span>
          </div>
        )}

        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Create Brokerage</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Brokerage name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Admin email"
              value={form.primaryAdminEmail}
              onChange={(event) =>
                setForm({ ...form, primaryAdminEmail: event.target.value })
              }
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Admin name"
              value={form.primaryAdminName}
              onChange={(event) =>
                setForm({ ...form, primaryAdminName: event.target.value })
              }
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={form.planCode}
              onChange={(event) => setForm({ ...form, planCode: event.target.value })}
            >
              {PLANS.map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.label} - {money(plan.cents)}/mo
                </option>
              ))}
            </select>
          </div>
          <button
            className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={saving}
            onClick={createBrokerage}
          >
            {saving ? 'Creating...' : 'Create Brokerage'}
          </button>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-950">Brokerages</h2>
          </div>
          {loading ? (
            <div className="px-5 py-8 text-sm text-slate-500">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Brokerage</th>
                    <th className="px-4 py-3">Billing</th>
                    <th className="px-4 py-3">Seats</th>
                    <th className="px-4 py-3">Agents</th>
                    <th className="px-4 py-3">Join Code</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {brokerages.map((brokerage) => (
                    <tr key={brokerage.id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-950">{brokerage.name}</div>
                        <div className="text-xs text-slate-500">
                          {brokerage.primary_admin_email}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">
                          {brokerage.subscription_state}
                        </div>
                        <div className="text-xs text-slate-500">
                          Renews {dateLabel(brokerage.current_period_end)}
                        </div>
                        <div className="text-xs text-slate-500">
                          Grace ends {dateLabel(brokerage.grace_period_ends_at)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>{brokerage.purchased_seats} purchased</div>
                        <div>{brokerage.assigned_seats} assigned</div>
                        <div>{brokerage.available_seats} available</div>
                      </td>
                      <td className="px-4 py-4">
                        <div>{brokerage.active_agents} active</div>
                        <div>{brokerage.pending_agents} pending</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">
                        {brokerage.active_join_code_preview ?? 'Not active'}
                      </td>
                      <td className="space-y-2 px-4 py-4">
                        <button
                          className="block rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                          onClick={() => startCheckout(brokerage.id)}
                        >
                          Checkout
                        </button>
                        <button
                          className="block rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                          onClick={() => openPortal(brokerage.id)}
                        >
                          Billing
                        </button>
                        <button
                          className="block rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                          onClick={() => regenerateCode(brokerage.id)}
                        >
                          New Code
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
