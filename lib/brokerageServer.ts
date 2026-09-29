import crypto from 'crypto';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';
import {
  assertPlanSeatConfiguration,
  brokerageStatusGrantsAccess,
  resolveEntitlement,
} from '@/lib/brokerageRules.mjs';

export function createJoinCode() {
  const raw = crypto.randomBytes(15).toString('base64url').toUpperCase();
  return `AF-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}`;
}

export function hashJoinCode(code: string) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function previewJoinCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

export async function createActiveJoinCode({
  brokerageId,
  actorUserId,
}: {
  brokerageId: string;
  actorUserId?: string | null;
}) {
  const code = createJoinCode();

  await supabaseAdminClient
    .from('brokerage_join_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('brokerage_id', brokerageId)
    .is('revoked_at', null);

  const { data, error } = await supabaseAdminClient
    .from('brokerage_join_codes')
    .insert({
      brokerage_id: brokerageId,
      code_hash: hashJoinCode(code),
      code_preview: previewJoinCode(code),
      created_by_user_id: actorUserId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;

  await recordBrokerageEvent({
    brokerageId,
    actorUserId,
    eventType: 'join_code_regenerated',
    details: { code_preview: previewJoinCode(code) },
  });

  return { code, row: data };
}

export async function recordBrokerageEvent({
  brokerageId,
  membershipId,
  actorUserId,
  actorEmail,
  eventType,
  details,
}: {
  brokerageId?: string | null;
  membershipId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  eventType: string;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdminClient.from('brokerage_events').insert({
    brokerage_id: brokerageId ?? null,
    membership_id: membershipId ?? null,
    actor_user_id: actorUserId ?? null,
    actor_email: actorEmail ?? null,
    event_type: eventType,
    details: details ?? {},
  });

  if (error) {
    console.error('[Brokerage] Failed to write brokerage event.', error);
  }
}

export async function createBrokerage(payload: {
  name: string;
  legalName?: string | null;
  primaryAdminEmail: string;
  primaryAdminName?: string | null;
  phone?: string | null;
  planCode: string;
  purchasedSeats: number;
  monthlyPriceCents: number;
  customPriceOverride?: boolean;
  actorUserId?: string | null;
}) {
  const config = assertPlanSeatConfiguration({
    planCode: payload.planCode,
    purchasedSeats: payload.purchasedSeats,
    monthlyPriceCents: payload.monthlyPriceCents,
    customPriceOverride: payload.customPriceOverride ?? false,
  });

  const { data: brokerage, error } = await supabaseAdminClient
    .from('brokerages')
    .insert({
      name: payload.name.trim(),
      legal_name: payload.legalName?.trim() || null,
      primary_admin_email: payload.primaryAdminEmail.trim().toLowerCase(),
      primary_admin_name: payload.primaryAdminName?.trim() || null,
      phone: payload.phone?.trim() || null,
      plan_code: config.plan.code,
      purchased_seats: config.purchasedSeats,
      monthly_price_cents: config.monthlyPriceCents,
      custom_price_override: payload.customPriceOverride ?? false,
    })
    .select('*')
    .single();

  if (error) throw error;

  await supabaseAdminClient.from('brokerage_admins').insert({
    brokerage_id: brokerage.id,
    email: brokerage.primary_admin_email,
    name: brokerage.primary_admin_name,
    role: 'owner',
  });

  const joinCode = await createActiveJoinCode({
    brokerageId: brokerage.id,
    actorUserId: payload.actorUserId ?? null,
  });

  await recordBrokerageEvent({
    brokerageId: brokerage.id,
    actorUserId: payload.actorUserId ?? null,
    eventType: 'brokerage_created',
    details: {
      plan_code: brokerage.plan_code,
      purchased_seats: brokerage.purchased_seats,
      monthly_price_cents: brokerage.monthly_price_cents,
    },
  });

  return { brokerage, joinCode: joinCode.code };
}

export async function loadBrokerageSummary() {
  const [{ data: brokerages, error }, { data: memberships }] = await Promise.all([
    supabaseAdminClient
      .from('brokerages')
      .select('*, brokerage_join_codes(code_preview, revoked_at, created_at)')
      .order('created_at', { ascending: false }),
    supabaseAdminClient.from('brokerage_memberships').select('*'),
  ]);

  if (error) throw error;

  return (brokerages ?? []).map((brokerage: any) => {
    const brokerageMemberships = (memberships ?? []).filter(
      (membership: any) => membership.brokerage_id === brokerage.id,
    );
    const assignedSeats = brokerageMemberships.filter(
      (membership: any) =>
        membership.status === 'active' &&
        membership.seat_assigned_at &&
        !membership.seat_revoked_at,
    ).length;
    const pendingAgents = brokerageMemberships.filter(
      (membership: any) => membership.status === 'pending',
    ).length;
    const activeJoinCode = (brokerage.brokerage_join_codes ?? []).find(
      (code: any) => !code.revoked_at,
    );

    return {
      ...brokerage,
      assigned_seats: assignedSeats,
      available_seats: Math.max(0, Number(brokerage.purchased_seats) - assignedSeats),
      pending_agents: pendingAgents,
      active_agents: assignedSeats,
      access_state: brokerageStatusGrantsAccess(
        brokerage.subscription_state,
        brokerage.grace_period_ends_at,
      )
        ? 'granting_access'
        : 'not_granting_access',
      active_join_code_preview: activeJoinCode?.code_preview ?? null,
    };
  });
}

export async function resolveUserAccess(userId: string) {
  const [{ data: user }, { data: membership }] = await Promise.all([
    supabaseAdminClient.from('users').select('*').eq('id', userId).maybeSingle(),
    supabaseAdminClient
      .from('brokerage_memberships')
      .select('*, brokerages(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('seat_assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return resolveEntitlement({
    user,
    membership,
    brokerage: (membership as any)?.brokerages ?? null,
  });
}
