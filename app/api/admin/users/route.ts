// app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

// GET /api/admin/users  -> list all users
export async function GET() {
  try {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({
      perPage: 1000,
    });

    if (error) throw error;

    return NextResponse.json({ users: data?.users ?? [] });
  } catch (err: any) {
    console.error('List users failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to list users.' },
      { status: 500 }
    );
  }
}

// POST /api/admin/users  -> create a new agent account
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, password, role } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true, // mark as confirmed so they can log in immediately
      user_metadata: {
        firstName: firstName?.trim() || '',
        lastName: lastName?.trim() || '',
        phone: phone?.trim() || '',
        role: role || 'agent',
      },
    });

    if (error) throw error;

    return NextResponse.json({ user: data.user });
  } catch (err: any) {
    console.error('Create user failed', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to create user.' },
      { status: 500 }
    );
  }
}
