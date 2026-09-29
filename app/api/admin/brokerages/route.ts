import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { protectedBillingFieldsInPatch } from '@/lib/brokerageRules.mjs';
import { createActiveJoinCode, createBrokerage, loadBrokerageSummary } from '@/lib/brokerageServer';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

function requiredString(value: unknown, label: string) {
  const next = String(value ?? '').trim();
  if (!next) throw new Error(`${label} is required.`);
  return next;
}

export async function GET() {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const brokerages = await loadBrokerageSummary();

    await logAdminAudit({
      action: 'read',
      resourceType: 'brokerages',
      actor: auth.user,
      details: { count: brokerages.length },
    });

    return NextResponse.json({ ok: true, brokerages });
  } catch (error: any) {
    console.error('Brokerage list failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to load brokerages.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const created = await createBrokerage({
      name: requiredString(body.name, 'Brokerage name'),
      legalName: body.legalName ?? null,
      primaryAdminEmail: requiredString(body.primaryAdminEmail, 'Primary admin email'),
      primaryAdminName: body.primaryAdminName ?? null,
      phone: body.phone ?? null,
      planCode: requiredString(body.planCode, 'Plan'),
      purchasedSeats: Number(body.purchasedSeats),
      monthlyPriceCents: Number(body.monthlyPriceCents),
      customPriceOverride: body.customPriceOverride === true,
      actorUserId: auth.user.id,
    });

    await logAdminAudit({
      action: 'create',
      resourceType: 'brokerage',
      actor: auth.user,
      request: req,
      resourceId: created.brokerage.id,
      targetEmail: created.brokerage.primary_admin_email,
      details: {
        planCode: created.brokerage.plan_code,
        purchasedSeats: created.brokerage.purchased_seats,
      },
    });

    return NextResponse.json({ ok: true, ...created });
  } catch (error: any) {
    console.error('Brokerage create failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to create brokerage.' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const id = requiredString(body?.id, 'Brokerage id');
    const action = String(body?.action ?? '').trim();

    if (action === 'regenerate_join_code') {
      const joinCode = await createActiveJoinCode({
        brokerageId: id,
        actorUserId: auth.user.id,
      });

      await logAdminAudit({
        action: 'update',
        resourceType: 'brokerage_join_code',
        actor: auth.user,
        request: req,
        resourceId: id,
      });

      return NextResponse.json({ ok: true, joinCode: joinCode.code });
    }

    const protectedBillingFields = protectedBillingFieldsInPatch(body ?? {});
    if (protectedBillingFields.length > 0) {
      await logAdminAudit({
        action: 'update',
        resourceType: 'brokerage',
        actor: auth.user,
        request: req,
        resourceId: id,
        details: {
          reason: 'stripe_managed_billing_fields',
          blockedFields: protectedBillingFields,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            'Stripe-managed billing fields cannot be edited from the admin brokerage endpoint.',
          blockedFields: protectedBillingFields,
        },
        { status: 400 },
      );
    }

    const allowedFields = ['name', 'legal_name', 'primary_admin_email', 'primary_admin_name', 'phone'];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body?.[field] !== undefined) patch[field] = body[field];
    }

    const { data, error } = await supabaseAdminClient
      .from('brokerages')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    await logAdminAudit({
      action: 'update',
      resourceType: 'brokerage',
      actor: auth.user,
      request: req,
      resourceId: id,
      details: { updatedFields: Object.keys(patch) },
    });

    return NextResponse.json({ ok: true, brokerage: data });
  } catch (error: any) {
    console.error('Brokerage update failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to update brokerage.' },
      { status: 500 },
    );
  }
}
