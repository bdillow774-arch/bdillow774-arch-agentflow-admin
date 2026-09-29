import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return null;
  const next = String(value).trim();
  return next.length > 0 ? next : null;
}

function hasDashboardAccess(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  return (
    user.app_metadata?.dashboard_admin === true ||
    user.user_metadata?.role === 'dashboard_admin' ||
    user.user_metadata?.role === 'admin'
  );
}

async function findAuthUserByEmail(email: string) {
  const { data, error } = await supabaseAdminClient.auth.admin.listUsers({
    perPage: 1000,
  });

  if (error) throw error;

  return (data.users ?? []).find(
    (user) => (user.email || '').toLowerCase() === email.toLowerCase(),
  );
}

export async function GET() {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const [{ data: authData, error: authError }, { data: appUsers }] =
      await Promise.all([
        supabaseAdminClient.auth.admin.listUsers({ perPage: 1000 }),
        supabaseAdminClient.from('users').select('id,email'),
      ]);

    if (authError) throw authError;

    const appUsersById = new Map((appUsers ?? []).map((user) => [user.id, user]));
    const appUsersByEmail = new Map(
      (appUsers ?? []).map((user) => [String(user.email || '').toLowerCase(), user]),
    );

    const admins = (authData?.users ?? [])
      .filter(hasDashboardAccess)
      .map((user) => {
        const linkedAppUser =
          appUsersById.has(user.id) ||
          appUsersByEmail.has(String(user.email || '').toLowerCase());

        return {
          id: user.id,
          email: user.email,
          first_name: normalizeText(user.user_metadata?.firstName),
          last_name: normalizeText(user.user_metadata?.lastName),
          is_active: user.app_metadata?.dashboard_active !== false,
          created_at: user.created_at,
          linked_app_user: linkedAppUser,
        };
      });

    await logAdminAudit({
      action: 'read',
      resourceType: 'dashboard_admins',
      actor: auth.user,
      details: {
        count: admins.length,
      },
    });

    return NextResponse.json({ ok: true, admins });
  } catch (error: any) {
    console.error('List dashboard admins failed', error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Failed to list dashboard admins.',
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: 'Email and password are required.' },
        { status: 400 },
      );
    }

    let user;
    const existingUser = await findAuthUserByEmail(email);

    if (existingUser) {
      const { data, error } = await supabaseAdminClient.auth.admin.updateUserById(
        existingUser.id,
        {
          email,
          password,
          email_confirm: true,
          app_metadata: {
            ...(existingUser.app_metadata || {}),
            dashboard_admin: true,
            dashboard_active: true,
          },
          user_metadata: {
            ...(existingUser.user_metadata || {}),
            firstName,
            lastName,
            role: 'dashboard_admin',
          },
        },
      );

      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await supabaseAdminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          dashboard_admin: true,
          dashboard_active: true,
        },
        user_metadata: {
          firstName,
          lastName,
          role: 'dashboard_admin',
        },
      });

      if (error) throw error;
      user = data.user;
    }

    await logAdminAudit({
      action: 'create',
      resourceType: 'dashboard_admin',
      actor: auth.user,
      request: req,
      resourceId: user?.id ?? null,
      targetUserId: user?.id ?? null,
      targetEmail: email.toLowerCase(),
      details: {
        linkedExistingAuthUser: Boolean(existingUser),
      },
    });

    return NextResponse.json({ ok: true, admin: user });
  } catch (error: any) {
    console.error('Create dashboard admin failed', error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Failed to create dashboard admin.',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const id = String(body.id || '');

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Admin id is required.' },
        { status: 400 },
      );
    }

    const { data: usersData, error: listError } =
      await supabaseAdminClient.auth.admin.listUsers({ perPage: 1000 });

    if (listError) throw listError;

    const existingUser = (usersData.users ?? []).find((user) => user.id === id);

    if (!existingUser) {
      return NextResponse.json(
        { ok: false, error: 'Admin account not found.' },
        { status: 404 },
      );
    }

    const updatePayload: Record<string, unknown> = {
      email: String(body.email || existingUser.email || '').trim(),
      app_metadata: {
        ...(existingUser.app_metadata || {}),
        dashboard_admin: body.dashboard_admin ?? true,
        dashboard_active: body.is_active ?? true,
      },
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        firstName: String(body.first_name || '').trim(),
        lastName: String(body.last_name || '').trim(),
        role: body.dashboard_admin === false ? 'user' : 'dashboard_admin',
      },
    };

    if (typeof body.password === 'string' && body.password.trim()) {
      updatePayload.password = body.password;
    }

    const { data, error } = await supabaseAdminClient.auth.admin.updateUserById(
      id,
      updatePayload,
    );

    if (error) throw error;

    await logAdminAudit({
      action: 'update',
      resourceType: 'dashboard_admin',
      actor: auth.user,
      request: req,
      resourceId: id,
      targetUserId: id,
      targetEmail: String(updatePayload.email || '').toLowerCase() || null,
      details: {
        dashboardActive: body.is_active ?? true,
        passwordUpdated: typeof body.password === 'string' && body.password.trim().length > 0,
      },
    });

    return NextResponse.json({ ok: true, admin: data.user });
  } catch (error: any) {
    console.error('Update dashboard admin failed', error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Failed to update dashboard admin.',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const id = String(body?.id || '');

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Admin id is required.' },
        { status: 400 },
      );
    }

    const [{ data: authData, error: authError }, { data: appUsers }] =
      await Promise.all([
        supabaseAdminClient.auth.admin.listUsers({ perPage: 1000 }),
        supabaseAdminClient.from('users').select('id,email'),
      ]);

    if (authError) throw authError;

    const existingUser = (authData.users ?? []).find((user) => user.id === id);
    if (!existingUser) {
      return NextResponse.json({ ok: true });
    }

    const linkedAppUser = (appUsers ?? []).some(
      (user) =>
        user.id === id ||
        String(user.email || '').toLowerCase() ===
          String(existingUser.email || '').toLowerCase(),
    );

    if (linkedAppUser) {
      const { error } = await supabaseAdminClient.auth.admin.updateUserById(id, {
        app_metadata: {
          ...(existingUser.app_metadata || {}),
          dashboard_admin: false,
          dashboard_active: false,
        },
        user_metadata: {
          ...(existingUser.user_metadata || {}),
          role:
            existingUser.user_metadata?.role === 'dashboard_admin'
              ? 'user'
              : existingUser.user_metadata?.role,
        },
      });

      if (error) throw error;
    } else {
      const { error } = await supabaseAdminClient.auth.admin.deleteUser(id);
      if (error) throw error;
    }

    await logAdminAudit({
      action: 'delete',
      resourceType: 'dashboard_admin',
      actor: auth.user,
      request: req,
      resourceId: id,
      targetUserId: id,
      targetEmail: String(existingUser.email || '').toLowerCase() || null,
      details: {
        linkedAppUser,
        deletedAuthUser: !linkedAppUser,
      },
    });

    return NextResponse.json({ ok: true, linkedAppUser });
  } catch (error: any) {
    console.error('Delete dashboard admin failed', error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Failed to delete dashboard admin.',
      },
      { status: 500 },
    );
  }
}
