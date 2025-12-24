import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.',
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'past_due'
  | 'canceled'
  | 'inactive'
  | 'unknown';

function normalizeStatus(raw: any): SubscriptionStatus {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'active') return 'active';
  if (v === 'trialing' || v === 'trial') return 'trial';
  if (v === 'past_due') return 'past_due';
  if (v === 'canceled' || v === 'cancelled') return 'canceled';
  if (v === 'none' || v === 'inactive') return 'inactive';
  return 'unknown';
}

function monthsBetween(startIso: string | null, end: Date): number {
  if (!startIso) return 0;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function safeString(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 25)));

    const status = (url.searchParams.get('status') || 'all').toLowerCase(); // active|trial|past_due|canceled|inactive|unknown|all
    const plan = (url.searchParams.get('plan') || 'all').toLowerCase(); // paid|free|all
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    const sortBy = (url.searchParams.get('sortBy') || 'last_login') as
      | 'name'
      | 'email'
      | 'last_login'
      | 'open_houses'
      | 'months_active';

    const sortDir =
      (url.searchParams.get('sortDir') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    // Auth users (email + last_sign_in_at)
    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (usersErr) {
      return NextResponse.json({ ok: false, error: usersErr.message }, { status: 500 });
    }

    const users = usersData?.users || [];
    const ids = users.map((u) => u.id);

    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        page,
        pageSize,
        totalApprox: usersData?.total ?? null,
        users: [],
      });
    }

    /**
     * CRITICAL STABILITY FIX:
     * Never hard-select optional/unstable columns.
     * If you select a non-existent column, PostgREST errors out and breaks the whole endpoint.
     * So we select('*') and safely map fields in code.
     */
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .in('id', ids);

    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
    }

    const profById = new Map<string, any>();
    (profiles || []).forEach((p) => profById.set(p.id, p));

    // Open house counts via RPC (optional; defaults to 0 if missing)
    const countsById = new Map<string, number>();
    try {
      const { data: counts, error: countsErr } = await supabaseAdmin.rpc(
        'admin_open_house_counts',
        { user_ids: ids },
      );

      if (!countsErr && Array.isArray(counts)) {
        for (const row of counts) {
          countsById.set(row.user_id, Number(row.open_house_count || 0));
        }
      }
    } catch {
      // ok – counts remain 0
    }

    const now = new Date();

    let rows = users.map((u) => {
      const p = profById.get(u.id) || {};

      const subscription_status = normalizeStatus(p.subscription_status);
      const subscription_plan = safeString(p.subscription_plan);

      const plan_type: 'paid' | 'free' =
        subscription_status === 'active' ||
        subscription_status === 'trial' ||
        subscription_status === 'past_due' ||
        subscription_status === 'canceled'
          ? 'paid'
          : 'free';

      // last_login_at: prefer profiles.last_login_at; fallback to auth.users.last_sign_in_at
      const last_login_at = (p.last_login_at || u.last_sign_in_at || null) as string | null;

      // Support BOTH naming variants (your schema has had typos)
      const device_type = safeString(p.device_type ?? p.devise_type);
      const os_name = safeString(p.os_name);
      const os_version = safeString(p.os_version);

      const subscriptionStart =
        safeString(p.subscription_start_at) ?? safeString(p.subscription_started_at);

      const months_active = monthsBetween(subscriptionStart, now);

      return {
        id: u.id,
        first_name: safeString(p.first_name),
        last_name: safeString(p.last_name),
        email: safeString(u.email),
        phone: safeString(p.phone),

        subscription_status,
        plan_type,
        subscription_plan,

        // keep available for future UI if needed
        trial_end_at: p.trial_end_at ?? p.trail_end_at ?? null,
        billing_platform: safeString(p.billing_platform),

        last_login_at,

        device_type,
        os_name,
        os_version,

        open_house_count: countsById.get(u.id) ?? 0,
        months_active,
      };
    });

    // Filters
    if (status !== 'all') rows = rows.filter((r) => r.subscription_status === status);
    if (plan !== 'all') rows = rows.filter((r) => r.plan_type === plan);

    if (q) {
      rows = rows.filter((r) => {
        const text = `${r.first_name || ''} ${r.last_name || ''} ${r.email || ''} ${
          r.phone || ''
        }`
          .toLowerCase()
          .trim();
        return text.includes(q);
      });
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
      const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();

      if (sortBy === 'name') return aName.localeCompare(bName) * dir;
      if (sortBy === 'email')
        return String(a.email || '').localeCompare(String(b.email || '')) * dir;

      if (sortBy === 'last_login') {
        const at = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const bt = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        return (at - bt) * dir;
      }

      if (sortBy === 'open_houses') return (a.open_house_count - b.open_house_count) * dir;
      if (sortBy === 'months_active') return (a.months_active - b.months_active) * dir;

      return 0;
    });

    return NextResponse.json({
      ok: true,
      page,
      pageSize,
      totalApprox: usersData?.total ?? null,
      users: rows,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
