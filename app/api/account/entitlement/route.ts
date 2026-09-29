import { NextResponse } from 'next/server';
import { resolveUserAccess } from '@/lib/brokerageServer';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

async function getBearerUser(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  const { data, error } = await supabaseAdminClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function GET(req: Request) {
  try {
    const user = await getBearerUser(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required.' },
        { status: 401 },
      );
    }

    const entitlement = await resolveUserAccess(user.id);

    const { data: memberships } = await supabaseAdminClient
      .from('brokerage_memberships')
      .select('status, requested_at, approved_at, removed_at, brokerages(id, name, subscription_state)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      ok: true,
      hasAccess: entitlement.hasAccess,
      sources: entitlement.sources,
      memberships: memberships ?? [],
    });
  } catch (error: any) {
    console.error('Account entitlement failed', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to resolve entitlement.' },
      { status: 500 },
    );
  }
}
