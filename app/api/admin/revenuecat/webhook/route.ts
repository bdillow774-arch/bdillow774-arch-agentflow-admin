import { NextRequest, NextResponse } from 'next/server';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';

export async function GET() {
  const auth = await requireDashboardAdmin();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    route: '/api/revenuecat/webhook',
    method: 'GET',
  });
}

export async function POST(_req: NextRequest) {
  const auth = await requireDashboardAdmin();
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      ok: false,
      error: 'Use /api/revenuecat-webhook for live RevenueCat events.',
    },
    { status: 405 },
  );
}
   
