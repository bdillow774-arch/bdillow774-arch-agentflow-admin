import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  // This is just for quick testing in the browser
  return NextResponse.json({
    ok: true,
    route: '/api/revenuecat/webhook',
    method: 'GET',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  return NextResponse.json({
    ok: true,
    route: '/api/revenuecat/webhook',
    method: 'POST',
    receivedBody: body,
  });
}
   