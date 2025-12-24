// app/api/admin/open-house/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

// GET /api/admin/open-house -> list all open house leads
export async function GET() {
  try {
    const { data, error } = await supabaseAdminClient
      .from('open_house_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('open_house_leads error', error);
      return NextResponse.json(
        {
          error:
            error.message ||
            'Failed to load open house leads. Check that the open_house_leads table exists.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ leads: data || [] });
  } catch (err: any) {
    console.error('List open house leads failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load open house reports.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/open-house -> delete selected leads by id
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const ids = body?.ids as string[] | undefined;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'No IDs provided for deletion.' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdminClient
      .from('open_house_leads')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('open_house_leads delete error', error);
      return NextResponse.json(
        {
          error:
            error.message ||
            'Failed to delete selected open house leads. Please try again.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete open house leads failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to delete selected leads.' },
      { status: 500 }
    );
  }
}
