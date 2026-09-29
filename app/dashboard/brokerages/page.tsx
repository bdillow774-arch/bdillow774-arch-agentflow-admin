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

type Membership = {
  id: string;
  brokerage_id: string;
  email: string | null;
  status: string;
  requested_at: string | null;
  approved_at: string | null;
  removed_at: string | null;
  seat_assigned_at: string | null;
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
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function dateLabel(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function BrokeragesPage() {
  const [brokerages, setBrokerages] = useState<Brokerage[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedId, setSelectedId] = useState('');
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
  const selectedBrokerage =
    brokerages.find((brokerage) => brokerage.id === selectedId) ?? brokerages[0] ?? null;
  const selectedMemberships = memberships.filter(
    (membership) => membership.brokerage_id === selectedBrokerage?.id,
  );
  const pendingRequests = selectedMemberships.filter(
    (membership) => membership.status === 'pending',
  );
  const activeAgents = selectedMemberships.filter(
    (membership) => membership.status === 'active',
  );
  const seatPercent = selectedBrokerage
    ? Math.min(
        100,
        Math.round(
          (selectedBrokerage.assigned_seats /
            Math.max(1, selectedBrokerage.purchased_seats)) *
            100,
        ),
      )
    : 0;

  const loadBrokerages = async (preferredId?: string) => {
    try {
      setLoading(true);
      setError(null);

      const [brokerageResponse, membershipResponse] = await Promise.all([
        fetch('/api/admin/brokerages', { cache: 'no-store' }),
        fetch('/api/admin/brokerages/memberships', { cache: 'no-store' }),
      ]);
      const brokeragePayload = await brokerageResponse.json();
      const membershipPayload = await membershipResponse.json();

      if (!brokerageResponse.ok || !brokeragePayload.ok) {
        throw new Error(brokeragePayload.error || 'Failed to load brokerages.');
      }
      if (!membershipResponse.ok || !membershipPayload.ok) {
        throw new Error(membershipPayload.error || 'Failed to load memberships.');
      }

      const rows = brokeragePayload.brokerages ?? [];
      setBrokerages(rows);
      setMemberships(membershipPayload.memberships ?? []);
      setSelectedId(preferredId || selectedId || rows[0]?.id || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load brokerages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBrokerages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setMessage('Brokerage created. Stripe Checkout remains unavailable until Stripe keys are configured.');
      await loadBrokerages(payload.brokerage.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to create brokerage.');
    } finally {
      setSaving(false);
    }
  };

  const membershipAction = async (id: string, action: 'approve' | 'reject' | 'remove') => {
    const response = await fetch('/api/admin/brokerages/memberships', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setError(payload.error || `Failed to ${action} membership.`);
      return;
    }
    setMessage(`Membership ${action}d.`);
    await loadBrokerages(selectedBrokerage?.id);
  };

  const startCheckout = async (brokerageId: string) => {
    const response = await fetch('/api/admin/brokerages/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brokerageId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.checkoutUrl) {
      setError(payload.error || 'Stripe Checkout is not configured yet.');
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
    if (!response.ok || !payload.ok || !payload.portalUrl) {
      setError(payload.error || 'Stripe Billing Portal is not configured yet.');
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
    await loadBrokerages(brokerageId);
  };

  return (
    <div className="min-h-screen px-4 py-6 text-[#172033] lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-[#2187e5]">
              Brokerage Management Portal
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#172033] sm:text-4xl">
              Brokerage Seat Management
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Manage purchased seats, pending join requests, join codes, and
              billing status using the secure backend workflow.
            </p>
          </div>
          <select
            className="af-focus rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            value={selectedBrokerage?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {brokerages.length === 0 ? (
              <option value="">No brokerages yet</option>
            ) : (
              brokerages.map((brokerage) => (
                <option key={brokerage.id} value={brokerage.id}>
                  {brokerage.name}
                </option>
              ))
            )}
          </select>
        </header>

        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        {newJoinCode && (
          <Notice tone="warning">
            New join code:{' '}
            <span className="font-mono font-semibold">{newJoinCode}</span>
          </Notice>
        )}

        <section className="af-card mb-6 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-[#172033]">Create Brokerage</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Field label="Brokerage name">
              <input
                className="af-focus w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Admin email">
              <input
                className="af-focus w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                value={form.primaryAdminEmail}
                onChange={(event) =>
                  setForm({ ...form, primaryAdminEmail: event.target.value })
                }
              />
            </Field>
            <Field label="Admin name">
              <input
                className="af-focus w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                value={form.primaryAdminName}
                onChange={(event) =>
                  setForm({ ...form, primaryAdminName: event.target.value })
                }
              />
            </Field>
            <Field label="Plan">
              <select
                className="af-focus w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                value={form.planCode}
                onChange={(event) => setForm({ ...form, planCode: event.target.value })}
              >
                {PLANS.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.label} - {money(plan.cents)}/mo
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            className="af-focus mt-4 rounded-xl bg-[#2187e5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            disabled={saving}
            onClick={createBrokerage}
          >
            {saving ? 'Creating...' : 'Create Brokerage'}
          </button>
        </section>

        {loading ? (
          <div className="af-card rounded-2xl p-8 text-sm text-slate-500">Loading...</div>
        ) : selectedBrokerage ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
            <section className="grid gap-4 sm:grid-cols-2">
              <Metric label="Subscription" value={statusLabel(selectedBrokerage.subscription_state)} />
              <Metric label="Plan" value={`${selectedBrokerage.purchased_seats} seats`} />
              <Metric label="Monthly Price" value={money(selectedBrokerage.monthly_price_cents)} />
              <Metric label="Pending Requests" value={selectedBrokerage.pending_agents} />

              <div className="af-card rounded-2xl p-5 sm:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Seat Utilization</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedBrokerage.assigned_seats} assigned of{' '}
                      {selectedBrokerage.purchased_seats} purchased seats.
                    </p>
                  </div>
                  <div className="text-2xl font-semibold text-[#2187e5]">
                    {seatPercent}%
                  </div>
                </div>
                <div className="mt-5 h-3 rounded-full bg-[#e6f2ff]">
                  <div
                    className="h-3 rounded-full bg-[#2187e5]"
                    style={{ width: `${seatPercent}%` }}
                  />
                </div>
              </div>

              <div className="af-card rounded-2xl p-5 sm:col-span-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Brokerage Join Code</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Agents enter this code in AgentFlow to request membership.
                      It is not a subscription redemption code.
                    </p>
                  </div>
                  <button
                    className="af-focus rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                    onClick={() => regenerateCode(selectedBrokerage.id)}
                  >
                    Regenerate
                  </button>
                </div>
                <div className="mt-4 rounded-xl bg-[#eef7ff] px-4 py-3 font-mono text-sm text-[#172033]">
                  {selectedBrokerage.active_join_code_preview ?? 'No active code'}
                </div>
              </div>
            </section>

            <section className="grid gap-6">
              <Panel title="Billing">
                <div className="grid gap-3 text-sm text-slate-700">
                  <InfoRow label="Current plan" value={`${selectedBrokerage.purchased_seats} seats`} />
                  <InfoRow label="Monthly price" value={money(selectedBrokerage.monthly_price_cents)} />
                  <InfoRow label="Stripe status" value={selectedBrokerage.stripe_subscription_status ?? 'Not connected'} />
                  <InfoRow label="Next billing" value={dateLabel(selectedBrokerage.current_period_end)} />
                  <InfoRow label="Grace period ends" value={dateLabel(selectedBrokerage.grace_period_ends_at)} />
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className="af-focus rounded-xl bg-[#2187e5] px-4 py-2.5 text-sm font-semibold text-white"
                    onClick={() => startCheckout(selectedBrokerage.id)}
                  >
                    Start Checkout
                  </button>
                  <button
                    className="af-focus rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                    onClick={() => openPortal(selectedBrokerage.id)}
                  >
                    Manage Billing
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Stripe-dependent actions require Stripe test credentials and
                  will show a clear error until configured.
                </p>
              </Panel>

              <Panel title="Upgrade Options">
                <div className="grid gap-2">
                  {PLANS.filter((plan) => plan.seats > selectedBrokerage.purchased_seats).map((plan) => (
                    <div key={plan.code} className="flex items-center justify-between rounded-xl bg-[#f4f9ff] px-4 py-3 text-sm">
                      <span className="font-semibold">{plan.label}</span>
                      <span>{money(plan.cents)}/mo</span>
                    </div>
                  ))}
                  {selectedBrokerage.purchased_seats >= 250 && (
                    <div className="rounded-xl bg-[#f4f9ff] px-4 py-3 text-sm">
                      251+ seats require custom pricing.
                    </div>
                  )}
                </div>
              </Panel>
            </section>

            <section className="af-card rounded-2xl p-5 xl:col-span-2">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Join Requests</h2>
                  <p className="text-sm text-slate-600">
                    Pending agents do not receive brokerage entitlement until approved.
                  </p>
                </div>
              </div>
              <ResponsiveMembershipList
                rows={pendingRequests}
                empty="No pending requests."
                actions={(membership) => (
                  <>
                    <button className="table-action-primary" onClick={() => membershipAction(membership.id, 'approve')}>
                      Approve
                    </button>
                    <button className="table-action" onClick={() => membershipAction(membership.id, 'reject')}>
                      Reject
                    </button>
                  </>
                )}
              />
            </section>

            <section className="af-card rounded-2xl p-5 xl:col-span-2">
              <h2 className="text-lg font-semibold">Agents</h2>
              <ResponsiveMembershipList
                rows={activeAgents}
                empty="No active brokerage agents."
                actions={(membership) => (
                  <button className="table-action" onClick={() => membershipAction(membership.id, 'remove')}>
                    Remove
                  </button>
                )}
              />
            </section>
          </div>
        ) : (
          <div className="af-card rounded-2xl p-8 text-sm text-slate-500">
            Create a brokerage to begin managing seats.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];

  return <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="af-card rounded-2xl p-5">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold capitalize text-[#172033]">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="af-card rounded-2xl p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold capitalize text-[#172033]">{value}</span>
    </div>
  );
}

function ResponsiveMembershipList({
  rows,
  empty,
  actions,
}: {
  rows: Membership[];
  empty: string;
  actions: (membership: Membership) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <div className="mt-4 rounded-xl bg-[#f4f9ff] px-4 py-6 text-sm text-slate-500">{empty}</div>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-3">Agent</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Requested</th>
            <th className="px-3 py-3">Joined</th>
            <th className="px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((membership) => (
            <tr key={membership.id}>
              <td className="px-3 py-3 font-medium text-[#172033]">
                {membership.email ?? 'Unknown agent'}
              </td>
              <td className="px-3 py-3 capitalize text-slate-600">
                {statusLabel(membership.status)}
              </td>
              <td className="px-3 py-3 text-slate-600">{dateLabel(membership.requested_at)}</td>
              <td className="px-3 py-3 text-slate-600">{dateLabel(membership.approved_at ?? membership.seat_assigned_at)}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">{actions(membership)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
