import { NextResponse } from 'next/server';
import { hashJoinCode, recordBrokerageEvent } from '@/lib/brokerageServer';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

async function getBearerUser(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  const { data, error } = await supabaseAdminClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function POST(req: Request) {
  try {
    const user = await getBearerUser(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required.' },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    const code = String(body?.code ?? '').trim().toUpperCase();
    if (!code) {
      return NextResponse.json(
        { ok: false, error: 'Brokerage code is required.' },
        { status: 400 },
      );
    }

    const { data: joinCode, error: codeError } = await supabaseAdminClient
      .from('brokerage_join_codes')
      .select('*, brokerages(id, name, subscription_state, grace_period_ends_at)')
      .eq('code_hash', hashJoinCode(code))
      .is('revoked_at', null)
      .maybeSingle();

    if (codeError) throw codeError;
    if (!joinCode || (joinCode.expires_at && new Date(joinCode.expires_at) < new Date())) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired brokerage code.' },
        { status: 404 },
      );
    }

    const { data: membership, error } = await supabaseAdminClient
      .from('brokerage_memberships')
      .upsert(
        {
          brokerage_id: joinCode.brokerage_id,
          user_id: user.id,
          email: user.email?.toLowerCase() ?? null,
          status: 'pending',
          join_code_id: joinCode.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'brokerage_id,user_id' },
      )
      .select('*')
      .single();

    if (error) throw error;

    await recordBrokerageEvent({
      brokerageId: joinCode.brokerage_id,
      membershipId: membership.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      eventType: 'membership_requested',
    });

    return NextResponse.json({
      ok: true,
      status: membership.status,
      brokerage: {
        id: joinCode.brokerages.id,
        name: joinCode.brokerages.name,
      },
    });
  } catch (error: any) {
    console.error('Brokerage join failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to request brokerage access.' },
      { status: 500 },
    );
  }
}
