'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

type AccountType = 'free' | 'trial' | 'paid';
type SubscriptionStatus =
  | 'inactive'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'canceled';
type SubscriptionProvider = 'none' | 'apple' | 'google' | 'manual';

type UserRow = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  is_admin?: boolean | null;
  is_active?: boolean | null;
  account_type?: AccountType | null;
  trial_length_days?: number | null;
  trial_ends_at?: string | null;
  subscription_provider?: SubscriptionProvider | null;
  subscription_status?: SubscriptionStatus | null;
  subscription_current_period_end?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_login_at?: string | null;
  device_type?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  last_location?: unknown;
  auth_created_at?: string | null;
  auth_last_sign_in_at?: string | null;
  auth_user_metadata?: Record<string, unknown> | null;
  auth_app_metadata?: Record<string, unknown> | null;
  profile_record?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type EditFormState = {
  id: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_admin: boolean;
  is_active: boolean;
  account_type: AccountType;
  trial_length_days: string;
  trial_ends_at: string;
  subscription_provider: SubscriptionProvider;
  subscription_status: SubscriptionStatus;
  subscription_current_period_end: string;
};

type CreateFormState = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  account_type: AccountType;
  subscription_provider: SubscriptionProvider;
  subscription_status: SubscriptionStatus;
  is_admin: boolean;
};

const ACCOUNT_TYPE_OPTIONS: AccountType[] = ['free', 'trial', 'paid'];
const SUBSCRIPTION_STATUS_OPTIONS: SubscriptionStatus[] = [
  'inactive',
  'trial',
  'active',
  'past_due',
  'canceled',
];
const SUBSCRIPTION_PROVIDER_OPTIONS: SubscriptionProvider[] = [
  'none',
  'apple',
  'google',
  'manual',
];

export default function ManageUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<EditFormState | null>(null);
  const [search, setSearch] = useState('');
  const [createForm, setCreateForm] = useState<CreateFormState>({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    account_type: 'free',
    subscription_provider: 'none',
    subscription_status: 'inactive',
    is_admin: false,
  });

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/admin/users', {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Could not load users.');
        }

        setUsers(normalizeUserRows(payload.users));
      } catch (err: any) {
        console.error('Manage users load error:', err);
        setError(err?.message || 'Could not load users.');
      } finally {
        setLoading(false);
      }
    };

    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      const haystack = [
        user.first_name,
        user.last_name,
        user.email,
        user.phone,
        formatLocationSummary(user.last_location),
      ]
        .map((value) => safeDisplayText(value))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [search, users]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const openUser = (user: UserRow) => {
    setSelectedUserId(user.id);
    setEditingUser({
      id: safeDisplayText(user.id),
      email: safeDisplayText(user.email),
      password: '',
      first_name: safeDisplayText(user.first_name),
      last_name: safeDisplayText(user.last_name),
      phone: safeDisplayText(user.phone),
      is_admin: !!user.is_admin,
      is_active: user.is_active ?? true,
      account_type: normalizeAccountType(user.account_type),
      trial_length_days:
        typeof user.trial_length_days === 'number'
          ? String(user.trial_length_days)
          : '',
      trial_ends_at: toDateInput(user.trial_ends_at),
      subscription_provider:
        normalizeSubscriptionProvider(user.subscription_provider),
      subscription_status:
        normalizeSubscriptionStatus(user.subscription_status),
      subscription_current_period_end: toDateInput(
        user.subscription_current_period_end,
      ),
    });
  };

  const closeUser = () => {
    setSelectedUserId(null);
    setEditingUser(null);
    setSaving(false);
  };

  const handleEditChange = (
    field: keyof EditFormState,
    value: string | boolean,
  ) => {
    if (!editingUser) return;
    setEditingUser({
      ...editingUser,
      [field]: value,
    });
  };

  const handleSave = async () => {
    if (!editingUser) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          email: editingUser.email.trim(),
          password: editingUser.password.trim() || undefined,
          first_name: emptyToNull(editingUser.first_name),
          last_name: emptyToNull(editingUser.last_name),
          phone: emptyToNull(editingUser.phone),
          is_admin: editingUser.is_admin,
          is_active: editingUser.is_active,
          account_type: editingUser.account_type,
          trial_length_days: editingUser.trial_length_days
            ? Number(editingUser.trial_length_days)
            : null,
          trial_ends_at: toIsoDate(editingUser.trial_ends_at),
          subscription_provider: editingUser.subscription_provider,
          subscription_status: editingUser.subscription_status,
          subscription_current_period_end: toIsoDate(
            editingUser.subscription_current_period_end,
          ),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Could not save user changes.');
      }

      setUsers((prev) =>
        prev.map((user) =>
          user.id === editingUser.id
            ? {
                ...user,
                ...payload.user,
                last_login_at:
                  user.last_login_at ?? payload.user.last_login_at ?? null,
                profile_record:
                  user.profile_record ?? payload.user.profile_record ?? null,
                auth_user_metadata:
                  user.auth_user_metadata ??
                  payload.user.auth_user_metadata ??
                  null,
                auth_app_metadata:
                  user.auth_app_metadata ??
                  payload.user.auth_app_metadata ??
                  null,
              }
            : user,
        ),
      );

      closeUser();
    } catch (err: any) {
      console.error('Manage users save error:', err);
      setError(err?.message || 'Could not save user changes.');
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Could not delete user.');
      }

      setUsers((prev) => prev.filter((user) => user.id !== id));
      setDeleteConfirmId(null);
      if (selectedUserId === id) closeUser();
    } catch (err: any) {
      console.error('Manage users delete error:', err);
      setError(err?.message || 'Could not delete user.');
    }
  };

  const handleCreateFormChange = (
    field: keyof CreateFormState,
    value: string | boolean,
  ) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetCreateForm = () => {
    setCreateForm({
      email: '',
      password: '',
      first_name: '',
      last_name: '',
      phone: '',
      account_type: 'free',
      subscription_provider: 'none',
      subscription_status: 'inactive',
      is_admin: false,
    });
  };

  const handleCreateUser = async () => {
    if (!createForm.email.trim() || !createForm.password.trim()) {
      setError('Email and password are required to create a user.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email.trim(),
          password: createForm.password,
          firstName: createForm.first_name.trim(),
          lastName: createForm.last_name.trim(),
          phone: emptyToNull(createForm.phone),
          role: createForm.is_admin ? 'admin' : 'agent',
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Could not create user.');
      }

      const authUser = payload.user as { id: string; email?: string | null; created_at?: string | null };

      const createdUser: UserRow = {
        id: authUser.id,
        email: authUser.email ?? createForm.email.trim(),
        first_name: emptyToNull(createForm.first_name),
        last_name: emptyToNull(createForm.last_name),
        phone: emptyToNull(createForm.phone),
        is_admin: createForm.is_admin,
        is_active: true,
        account_type: createForm.account_type,
        subscription_provider: createForm.subscription_provider,
        subscription_status: createForm.subscription_status,
        created_at: authUser.created_at ?? new Date().toISOString(),
      };

      if (
        createForm.account_type !== 'free' ||
        createForm.subscription_provider !== 'none' ||
        createForm.subscription_status !== 'inactive'
      ) {
        const updateResponse = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: createdUser.id,
            account_type: createForm.account_type,
            subscription_provider: createForm.subscription_provider,
            subscription_status: createForm.subscription_status,
            is_admin: createForm.is_admin,
            is_active: true,
            email: createdUser.email,
            first_name: createdUser.first_name,
            last_name: createdUser.last_name,
            phone: createdUser.phone,
          }),
        });
        const updatePayload = await updateResponse.json();

        if (!updateResponse.ok || !updatePayload.ok) {
          throw new Error(updatePayload.error || 'User created, but account settings could not be saved.');
        }

        Object.assign(createdUser, updatePayload.user);
      }

      setUsers((prev) => [createdUser, ...prev]);
      resetCreateForm();
      setIsCreateOpen(false);
    } catch (err: any) {
      console.error('Manage users create error:', err);
      setError(err?.message || 'Could not create user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              User Profiles
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Review the same core account fields used in the creation flow, plus
              the profile and auth data the AgentFlow app is collecting for each
              user.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            {loading
              ? 'Loading users...'
              : `${filteredUsers.length} visible of ${users.length} total users`}
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search name, email, phone, or location"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsCreateOpen(true);
            }}
            className="rounded-full bg-sky-500 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-400"
          >
            Add User
          </button>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <th className="px-5 py-4 font-medium">User</th>
                <th className="px-5 py-4 font-medium">Account</th>
                <th className="px-5 py-4 font-medium">Activity</th>
                <th className="px-5 py-4 font-medium">Device</th>
                <th className="px-5 py-4 font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-slate-500"
                  >
                    No users match your current search.
                  </td>
                </tr>
              )}

              {filteredUsers.map((user) => {
                const displayName =
                  [user.first_name, user.last_name]
                    .map((value) => safeDisplayText(value))
                    .filter(Boolean)
                    .join(' ') ||
                  'No name';
                const device = buildDeviceLabel(user);

                return (
                  <tr key={user.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {displayName}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {safeDisplayText(user.email) || 'No email on file'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {safeDisplayText(user.phone) || 'No phone on file'}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill>{normalizeAccountType(user.account_type).toUpperCase()}</StatusPill>
                      <div className="mt-2 text-sm text-slate-600">
                        Subscription: {normalizeSubscriptionStatus(user.subscription_status)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Provider: {normalizeSubscriptionProvider(user.subscription_provider)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      <div>Created {formatDateTime(user.created_at)}</div>
                      <div className="mt-1">
                        Last login {formatDateTime(user.last_login_at)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatLocationSummary(user.last_location) || 'No location data yet'}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {device || 'No device info yet'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openUser(user)}
                        className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-900">
              Delete user
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This removes the app user profile, and if the auth account is not
              still being used for dashboard access, the login will be removed too.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && editingUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/25 p-5 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-7 py-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  User Details
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {[selectedUser.first_name, selectedUser.last_name]
                    .map((value) => safeDisplayText(value))
                    .filter(Boolean)
                    .join(' ') || safeDisplayText(selectedUser.email)}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Full dashboard profile, synced with account creation fields plus
                  collected app data.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUser}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-6 px-7 py-7 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <SectionCard
                  title="Account Profile"
                  description="Matches the core editable fields used when managing user accounts."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Email">
                      <input
                        value={editingUser.email}
                        onChange={(event) =>
                          handleEditChange('email', event.target.value)
                        }
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Phone">
                      <input
                        value={editingUser.phone}
                        onChange={(event) =>
                          handleEditChange('phone', event.target.value)
                        }
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Reset Password">
                      <input
                        type="password"
                        value={editingUser.password}
                        onChange={(event) =>
                          handleEditChange('password', event.target.value)
                        }
                        placeholder="Leave blank to keep current password"
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="First Name">
                      <input
                        value={editingUser.first_name}
                        onChange={(event) =>
                          handleEditChange('first_name', event.target.value)
                        }
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Last Name">
                      <input
                        value={editingUser.last_name}
                        onChange={(event) =>
                          handleEditChange('last_name', event.target.value)
                        }
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Account Type">
                      <select
                        value={editingUser.account_type}
                        onChange={(event) =>
                          handleEditChange(
                            'account_type',
                            event.target.value as AccountType,
                          )
                        }
                        className={inputClassName}
                      >
                        {ACCOUNT_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Subscription Provider">
                      <select
                        value={editingUser.subscription_provider}
                        onChange={(event) =>
                          handleEditChange(
                            'subscription_provider',
                            event.target.value as SubscriptionProvider,
                          )
                        }
                        className={inputClassName}
                      >
                        {SUBSCRIPTION_PROVIDER_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Subscription Status">
                      <select
                        value={editingUser.subscription_status}
                        onChange={(event) =>
                          handleEditChange(
                            'subscription_status',
                            event.target.value as SubscriptionStatus,
                          )
                        }
                        className={inputClassName}
                      >
                        {SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Trial Length (days)">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={editingUser.trial_length_days}
                        onChange={(event) =>
                          handleEditChange(
                            'trial_length_days',
                            event.target.value,
                          )
                        }
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Trial Ends At">
                      <input
                        type="date"
                        value={editingUser.trial_ends_at}
                        onChange={(event) =>
                          handleEditChange('trial_ends_at', event.target.value)
                        }
                        className={inputClassName}
                      />
                    </Field>
                    <Field label="Current Period End">
                      <input
                        type="date"
                        value={editingUser.subscription_current_period_end}
                        onChange={(event) =>
                          handleEditChange(
                            'subscription_current_period_end',
                            event.target.value,
                          )
                        }
                        className={inputClassName}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-5">
                    <CheckboxField
                      label="Admin Access"
                      checked={editingUser.is_admin}
                      onChange={(checked) =>
                        handleEditChange('is_admin', checked)
                      }
                    />
                    <CheckboxField
                      label="Active Account"
                      checked={editingUser.is_active}
                      onChange={(checked) =>
                        handleEditChange('is_active', checked)
                      }
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="App Activity"
                  description="Key usage and device fields collected from the app and auth layer."
                >
                  <KeyValueGrid
                    rows={[
                      ['User ID', selectedUser.id],
                      ['Created At', formatDateTime(selectedUser.created_at)],
                      ['Updated At', formatDateTime(selectedUser.updated_at)],
                      ['Profile Last Login', formatDateTime(selectedUser.last_login_at)],
                      ['Auth Last Sign In', formatDateTime(selectedUser.auth_last_sign_in_at)],
                      ['Auth Created At', formatDateTime(selectedUser.auth_created_at)],
                      ['Device Type', selectedUser.device_type],
                      [
                        'Operating System',
                        [selectedUser.os_name, selectedUser.os_version]
                          .map((value) => safeDisplayText(value))
                          .filter(Boolean)
                          .join(' ') || null,
                      ],
                      ['Last Location', formatLocationSummary(selectedUser.last_location)],
                    ]}
                  />
                </SectionCard>
              </div>

              <div className="space-y-6">
                <SectionCard
                  title="Profile Record"
                  description='Everything currently available from the app-facing "profiles" record.'
                >
                  <DataInspector data={selectedUser.profile_record} />
                </SectionCard>

                <SectionCard
                  title="Auth User Metadata"
                  description="Raw user metadata from Supabase Auth."
                >
                  <DataInspector data={selectedUser.auth_user_metadata} />
                </SectionCard>

                <SectionCard
                  title="Auth App Metadata"
                  description="App metadata and roles stored on the auth account."
                >
                  <DataInspector data={selectedUser.auth_app_metadata} />
                </SectionCard>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-7 py-5">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(selectedUser.id)}
                className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete User
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeUser}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/25 p-5 backdrop-blur-sm">
          <div className="mx-auto max-w-3xl rounded-[32px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-7 py-6">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Manual User
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  Add User to AgentFlow
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Create an app user manually from the dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  resetCreateForm();
                }}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-6 px-7 py-7 md:grid-cols-2">
              <Field label="Email">
                <input
                  value={createForm.email}
                  onChange={(event) => handleCreateFormChange('email', event.target.value)}
                  className={inputClassName}
                  type="email"
                  placeholder="user@example.com"
                />
              </Field>
              <Field label="Password">
                <input
                  value={createForm.password}
                  onChange={(event) => handleCreateFormChange('password', event.target.value)}
                  className={inputClassName}
                  type="password"
                  placeholder="Create a password"
                />
              </Field>
              <Field label="First Name">
                <input
                  value={createForm.first_name}
                  onChange={(event) => handleCreateFormChange('first_name', event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Last Name">
                <input
                  value={createForm.last_name}
                  onChange={(event) => handleCreateFormChange('last_name', event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={createForm.phone}
                  onChange={(event) => handleCreateFormChange('phone', event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Account Type">
                <select
                  value={createForm.account_type}
                  onChange={(event) =>
                    handleCreateFormChange('account_type', event.target.value as AccountType)
                  }
                  className={inputClassName}
                >
                  {ACCOUNT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subscription Provider">
                <select
                  value={createForm.subscription_provider}
                  onChange={(event) =>
                    handleCreateFormChange(
                      'subscription_provider',
                      event.target.value as SubscriptionProvider,
                    )
                  }
                  className={inputClassName}
                >
                  {SUBSCRIPTION_PROVIDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subscription Status">
                <select
                  value={createForm.subscription_status}
                  onChange={(event) =>
                    handleCreateFormChange(
                      'subscription_status',
                      event.target.value as SubscriptionStatus,
                    )
                  }
                  className={inputClassName}
                >
                  {SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-7 py-5">
              <CheckboxField
                label="Create as admin app user"
                checked={createForm.is_admin}
                onChange={(checked) => handleCreateFormChange('is_admin', checked)}
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    resetCreateForm();
                  }}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateUser}
                  disabled={saving}
                  className="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      {children}
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-3 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
      />
      {label}
    </label>
  );
}

function KeyValueGrid({
  rows,
}: {
  rows: Array<[string, unknown]>;
}) {
  return (
    <div className="grid gap-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            {label}
          </div>
          <div className="text-sm text-slate-700">{safeDisplayText(value) || '—'}</div>
        </div>
      ))}
    </div>
  );
}

function DataInspector({
  data,
}: {
  data: Record<string, unknown> | null | undefined;
}) {
  const entries = Object.entries(data ?? {});

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
        No data available yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            {humanizeKey(key)}
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-sm text-slate-700">
            {formatValue(value)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-sky-700">
      {children}
    </span>
  );
}

function buildDeviceLabel(user: UserRow) {
  const parts = [user.device_type, user.os_name, user.os_version]
    .map((value) => safeDisplayText(value))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' • ') : null;
}

function formatLocationSummary(value: unknown) {
  if (!value) return null;

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (typeof value === 'object') {
    const location = value as Record<string, unknown>;
    const parts = [
      location.city,
      location.state,
      location.county,
      location.zip_code,
    ]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    return safeDisplayText(value);
  }

  return String(value);
}

function formatDateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function safeDisplayText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function emptyToNull(value: string) {
  const next = value.trim();
  return next.length > 0 ? next : null;
}

function toDateInput(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function humanizeKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeAccountType(value: unknown): AccountType {
  return ACCOUNT_TYPE_OPTIONS.includes(value as AccountType)
    ? (value as AccountType)
    : 'free';
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  return SUBSCRIPTION_STATUS_OPTIONS.includes(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : 'inactive';
}

function normalizeSubscriptionProvider(value: unknown): SubscriptionProvider {
  return SUBSCRIPTION_PROVIDER_OPTIONS.includes(value as SubscriptionProvider)
    ? (value as SubscriptionProvider)
    : 'none';
}

function normalizeUserRows(value: unknown): UserRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((rawUser, index) => {
      const user =
        rawUser && typeof rawUser === 'object'
          ? (rawUser as Record<string, unknown>)
          : {};
      const id = safeDisplayText(user.id) || `unknown-user-${index}`;

      return {
        ...user,
        id,
        email: safeDisplayText(user.email),
        first_name: normalizeNullableText(user.first_name),
        last_name: normalizeNullableText(user.last_name),
        phone: normalizeNullableText(user.phone),
        account_type: normalizeAccountType(user.account_type),
        subscription_provider: normalizeSubscriptionProvider(
          user.subscription_provider,
        ),
        subscription_status: normalizeSubscriptionStatus(
          user.subscription_status,
        ),
        device_type: normalizeNullableText(user.device_type),
        os_name: normalizeNullableText(user.os_name),
        os_version: normalizeNullableText(user.os_version),
      };
    });
}

function normalizeNullableText(value: unknown) {
  const text = safeDisplayText(value);
  return text.length > 0 ? text : null;
}

const inputClassName =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
