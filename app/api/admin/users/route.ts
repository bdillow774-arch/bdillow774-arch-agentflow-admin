// app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { logAdminAudit } from '@/lib/adminAudit';
import { requireDashboardAdmin } from '@/lib/dashboardAdminAuth';
import { supabaseAdminClient } from '@/lib/supabaseAdminClient';

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return null;
  const next = String(value).trim();
  return next.length > 0 ? next : null;
}

function isAuthUserMissingError(error: { message?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('user not found');
}

function isAlreadyRegisteredError(error: { message?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('already been registered');
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

function getProfileLinkId(profile: Record<string, any>) {
  return (
    normalizeText(profile.id) ??
    normalizeText(profile.user_id) ??
    normalizeText(profile.auth_user_id)
  );
}

function getProfileDeviceType(profile: Record<string, any> | null | undefined) {
  if (!profile) return null;

  return (
    normalizeText(profile.device_type) ??
    normalizeText(profile.devise_type) ??
    normalizeText(profile.device?.type) ??
    normalizeText(profile.device_info?.type) ??
    normalizeText(profile.platform)
  );
}

function getProfileOsName(profile: Record<string, any> | null | undefined) {
  if (!profile) return null;

  return (
    normalizeText(profile.os_name) ??
    normalizeText(profile.device?.os_name) ??
    normalizeText(profile.device_info?.os_name) ??
    normalizeText(profile.os?.name)
  );
}

function getProfileOsVersion(profile: Record<string, any> | null | undefined) {
  if (!profile) return null;

  return (
    normalizeText(profile.os_version) ??
    normalizeText(profile.device?.os_version) ??
    normalizeText(profile.device_info?.os_version) ??
    normalizeText(profile.os?.version)
  );
}

function getProfileLocation(profile: Record<string, any> | null | undefined) {
  if (!profile) return null;

  return (
    profile.last_location ??
    profile.last_login_location ??
    profile.location ??
    profile.current_location ??
    null
  );
}

// GET /api/admin/users -> list all dashboard-managed users
export async function GET() {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const [
      { data: users, error: usersError },
      { data: profiles },
      { data: authUsersData, error: authUsersError },
    ] =
      await Promise.all([
        supabaseAdminClient
          .from('users')
          .select('*')
          .order('created_at', { ascending: false }),
        supabaseAdminClient
          .from('profiles')
          .select('*'),
        supabaseAdminClient.auth.admin.listUsers({
          perPage: 1000,
        }),
      ]);

    if (usersError) throw usersError;
    if (authUsersError) throw authUsersError;

    const usersById = new Map(
      (users ?? []).map((user) => [String(user.id), user]),
    );
    const usersByEmail = new Map(
      (users ?? [])
        .map((user) => [normalizeText(user.email)?.toLowerCase(), user] as const)
        .filter(([email]) => Boolean(email)) as Array<[string, any]>,
    );

    const profileById = new Map(
      (profiles ?? [])
        .map((profile) => [getProfileLinkId(profile), profile] as const)
        .filter(([id]) => Boolean(id)) as Array<[string, any]>,
    );
    const profileByEmail = new Map(
      (profiles ?? [])
        .map((profile) => [normalizeText(profile.email)?.toLowerCase(), profile] as const)
        .filter(([email]) => Boolean(email)) as Array<[string, any]>,
    );

    const authUsersMap = new Map(
      (authUsersData?.users ?? []).map((user) => [String(user.id), user]),
    );

    const candidateIds = new Set<string>();

    for (const user of users ?? []) {
      candidateIds.add(String(user.id));
    }

    for (const profile of profiles ?? []) {
      const profileId = normalizeText(profile.id);
      if (profileId) {
        candidateIds.add(profileId);
      }
    }

    for (const authUser of authUsersData?.users ?? []) {
      const authId = String(authUser.id);
      const authEmail = normalizeText(authUser.email)?.toLowerCase();
      const linkedAppUser =
        usersById.has(authId) ||
        (authEmail ? usersByEmail.has(authEmail) : false) ||
        profileById.has(authId) ||
        (authEmail ? profileByEmail.has(authEmail) : false);

      if (linkedAppUser || !hasDashboardAccess(authUser)) {
        candidateIds.add(authId);
      }
    }

    const merged = Array.from(candidateIds).map((id) => {
      const appUser =
        usersById.get(id) ??
        usersByEmail.get(normalizeText(authUsersMap.get(id)?.email)?.toLowerCase() || '') ??
        null;
      const profile =
        profileById.get(id) ??
        profileById.get(normalizeText(appUser?.id) || '') ??
        profileByEmail.get(
          normalizeText(appUser?.email ?? authUsersMap.get(id)?.email)?.toLowerCase() || '',
        ) ??
        null;
      const authUser = authUsersMap.get(id) ?? null;

      const email =
        normalizeText(appUser?.email) ??
        normalizeText(profile?.email) ??
        normalizeText(authUser?.email);

      return {
        id,
        email: email ?? '',
        first_name:
          normalizeText(appUser?.first_name) ??
          normalizeText(profile?.first_name) ??
          normalizeText(authUser?.user_metadata?.firstName),
        last_name:
          normalizeText(appUser?.last_name) ??
          normalizeText(profile?.last_name) ??
          normalizeText(authUser?.user_metadata?.lastName),
        phone:
          normalizeText(appUser?.phone) ??
          normalizeText(profile?.phone) ??
          normalizeText(authUser?.user_metadata?.phone),
        is_admin:
          appUser?.is_admin ??
          (authUser ? hasDashboardAccess(authUser) : false),
        is_active: appUser?.is_active ?? true,
        account_type: appUser?.account_type ?? 'free',
        trial_length_days: appUser?.trial_length_days ?? null,
        trial_ends_at: appUser?.trial_ends_at ?? null,
        subscription_provider: appUser?.subscription_provider ?? 'none',
        subscription_status: appUser?.subscription_status ?? 'inactive',
        subscription_current_period_end:
          appUser?.subscription_current_period_end ?? null,
        created_at:
          appUser?.created_at ?? profile?.created_at ?? authUser?.created_at ?? null,
        updated_at: appUser?.updated_at ?? profile?.updated_at ?? null,
        last_login_at:
          profile?.last_login_at ?? authUser?.last_sign_in_at ?? null,
        device_type: getProfileDeviceType(profile),
        os_name: getProfileOsName(profile),
        os_version: getProfileOsVersion(profile),
        last_location: getProfileLocation(profile),
        auth_created_at: authUser?.created_at ?? null,
        auth_last_sign_in_at: authUser?.last_sign_in_at ?? null,
        auth_user_metadata: authUser?.user_metadata ?? null,
        auth_app_metadata: authUser?.app_metadata ?? null,
        profile_record: profile ?? null,
      };
    });

    merged.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    await logAdminAudit({
      action: 'read',
      resourceType: 'users',
      actor: auth.user,
      details: {
        count: merged.length,
      },
    });

    return NextResponse.json({ ok: true, users: merged });
  } catch (err: any) {
    console.error('List users failed', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to list users.' },
      { status: 500 }
    );
  }
}

// POST /api/admin/users  -> create a new agent account
export async function POST(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { firstName, lastName, email, phone, password, role } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    let createdOrRecoveredUser: any = null;

    const trimmedEmail = email.trim();
    const userMetadata = {
      firstName: firstName?.trim() || '',
      lastName: lastName?.trim() || '',
      phone: phone?.trim() || '',
      role: role || 'agent',
    };

    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true, // mark as confirmed so they can log in immediately
      user_metadata: userMetadata,
    });

    if (error && !isAlreadyRegisteredError(error)) throw error;

    if (error && isAlreadyRegisteredError(error)) {
      const { data: usersData, error: listError } =
        await supabaseAdminClient.auth.admin.listUsers({
          perPage: 1000,
        });

      if (listError) throw listError;

      const existingUser = (usersData?.users ?? []).find(
        (user) => (user.email || '').toLowerCase() === trimmedEmail.toLowerCase(),
      );

      if (!existingUser) throw error;

      const { data: recoveredData, error: recoverError } =
        await supabaseAdminClient.auth.admin.updateUserById(existingUser.id, {
          email: trimmedEmail,
          password,
          email_confirm: true,
          user_metadata: {
            ...(existingUser.user_metadata || {}),
            ...userMetadata,
          },
        });

      if (recoverError) throw recoverError;
      createdOrRecoveredUser = recoveredData.user;
    } else {
      createdOrRecoveredUser = data.user;
    }

    if (createdOrRecoveredUser) {
      const { error: profileError } = await supabaseAdminClient
        .from('users')
        .upsert(
          {
            id: createdOrRecoveredUser.id,
            email: trimmedEmail,
            first_name: normalizeText(firstName),
            last_name: normalizeText(lastName),
            phone: normalizeText(phone),
            is_admin: role === 'admin',
            is_active: true,
            account_type: 'free',
            subscription_status: 'inactive',
          },
          { onConflict: 'id' },
        );

      if (profileError) {
        throw profileError;
      }
    }

    await logAdminAudit({
      action: 'create',
      resourceType: 'user',
      actor: auth.user,
      request: req,
      resourceId: createdOrRecoveredUser?.id ?? null,
      targetUserId: createdOrRecoveredUser?.id ?? null,
      targetEmail: trimmedEmail.toLowerCase(),
      details: {
        role: role || 'agent',
      },
    });

    return NextResponse.json({ ok: true, user: createdOrRecoveredUser });
  } catch (err: any) {
    console.error('Create user failed', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to create user.' },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users -> update a dashboard-managed user row
export async function PATCH(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { id, password, ...updates } = body ?? {};

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'User id is required.' },
        { status: 400 },
      );
    }

    const payload = {
      ...updates,
      id: String(id),
      email: normalizeText(updates.email),
      first_name: normalizeText(updates.first_name),
      last_name: normalizeText(updates.last_name),
    };

    const authUpdatePayload: Record<string, unknown> = {};
    if (payload.email) {
      authUpdatePayload.email = payload.email;
    }
    if (typeof password === 'string' && password.trim().length > 0) {
      authUpdatePayload.password = password;
    }

    if (Object.keys(authUpdatePayload).length > 0) {
      const { error: authError } =
        await supabaseAdminClient.auth.admin.updateUserById(
          String(id),
          authUpdatePayload,
        );

      if (authError) throw authError;
    }

    const { data, error } = await supabaseAdminClient
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error('Could not load the saved user record.');
    }

    await logAdminAudit({
      action: 'update',
      resourceType: 'user',
      actor: auth.user,
      request: req,
      resourceId: String(id),
      targetUserId: String(id),
      targetEmail: payload.email?.toLowerCase?.() ?? null,
      details: {
        updatedFields: Object.keys(payload),
        passwordUpdated: Object.keys(authUpdatePayload).includes('password'),
      },
    });

    return NextResponse.json({ ok: true, user: data });
  } catch (err: any) {
    console.error('Update user failed', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to update user.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users -> delete a dashboard-managed user row
export async function DELETE(req: Request) {
  try {
    const auth = await requireDashboardAdmin();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const id = body?.id;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'User id is required.' },
        { status: 400 },
      );
    }

    const { data: authUsersData, error: authListError } =
      await supabaseAdminClient.auth.admin.listUsers({
        perPage: 1000,
      });

    if (authListError) throw authListError;

    const authUser = (authUsersData?.users ?? []).find(
      (user) => user.id === String(id),
    );

    if (authUser && !hasDashboardAccess(authUser)) {
      const { error: authError } =
        await supabaseAdminClient.auth.admin.deleteUser(String(id));

      if (authError && !isAuthUserMissingError(authError)) {
        throw authError;
      }
    }

    const { error: profileError } = await supabaseAdminClient
      .from('users')
      .delete()
      .eq('id', id);

    if (profileError) throw profileError;

    await logAdminAudit({
      action: 'delete',
      resourceType: 'user',
      actor: auth.user,
      request: req,
      resourceId: String(id),
      targetUserId: String(id),
      targetEmail: authUser?.email?.toLowerCase?.() ?? null,
      details: {
        authDeleted: Boolean(authUser && !hasDashboardAccess(authUser)),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Delete user failed', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Failed to delete user.' },
      { status: 500 }
    );
  }
}
