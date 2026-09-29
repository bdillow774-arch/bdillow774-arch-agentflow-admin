import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { recordBrokerageEvent } from '@/lib/brokerageServer';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

function requiredString(value: unknown, label: string) {
  const next = String(value ?? '').trim();
  if (!next) throw new Error(`${label} is required.`);
  return next;
}

export async function GET(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const brokerageId = url.searchParams.get('brokerageId');

    let query = supabaseAdminClient
      .from('brokerage_memberships')
      .select('*, brokerages(name, subscription_state, purchased_seats)')
      .order('created_at', { ascending: false });

    if (brokerageId) query = query.eq('brokerage_id', brokerageId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, memberships: data ?? [] });
  } catch (error: any) {
    console.error('Brokerage membership list failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to load memberships.' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const id = requiredString(body?.id, 'Membership id');
    const action = requiredString(body?.action, 'Action');

    if (action === 'approve') {
      const { data, error } = await supabaseAdminClient.rpc(
        'approve_brokerage_membership',
        {
          next_membership_id: id,
          next_actor_user_id: auth.user.id,
        },
      );

      if (error) throw error;

      await logAdminAudit({
        action: 'update',
        resourceType: 'brokerage_membership',
        actor: auth.user,
        request: req,
        resourceId: id,
        details: { action },
      });

      return NextResponse.json({ ok: true, membership: data });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (action === 'reject') {
      patch.status = 'rejected';
      patch.rejected_at = new Date().toISOString();
      patch.rejected_by_user_id = auth.user.id;
    } else if (action === 'remove') {
      patch.status = 'removed';
      patch.removed_at = new Date().toISOString();
      patch.removed_by_user_id = auth.user.id;
      patch.seat_revoked_at = new Date().toISOString();
    } else {
      return NextResponse.json(
        { ok: false, error: 'Unsupported membership action.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdminClient
      .from('brokerage_memberships')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    await recordBrokerageEvent({
      brokerageId: data.brokerage_id,
      membershipId: data.id,
      actorUserId: auth.user.id,
      eventType: `membership_${action}`,
    });

    await logAdminAudit({
      action: 'update',
      resourceType: 'brokerage_membership',
      actor: auth.user,
      request: req,
      resourceId: id,
      details: { action },
    });

    return NextResponse.json({ ok: true, membership: data });
  } catch (error: any) {
    console.error('Brokerage membership update failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to update membership.' },
      { status: 500 },
    );
  }
}
