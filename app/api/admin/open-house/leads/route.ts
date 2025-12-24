// app/api/admin/open-house/leads/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

// GET /api/admin/open-house/leads?sessionId=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdminClient
      .from('open_house_leads')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ leads: data || [] });
  } catch (err: any) {
    console.error('List open house leads failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load open house leads.' },
      { status: 500 }
    );
  }
}
