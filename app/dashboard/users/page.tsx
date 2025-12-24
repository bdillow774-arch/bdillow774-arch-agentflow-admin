'use client';

import React, { useEffect, useState } from 'react';
import { supabaseBrowserClient } from '@/lib/supabaseClient';

type AccountType = 'free' | 'trial' | 'paid';
type SubscriptionStatus =
  | 'inactive'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'canceled';

type UserRow = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  is_admin?: boolean | null;
  is_active?: boolean | null;
  account_type?: AccountType | null;
  subscription_status?: SubscriptionStatus | null;

  // Tracking fields (from public.profiles)
  last_login_at?: string | null;
  device_type?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  last_location?: string | null;

  // Backward compat (older code used this)
  device_info?: string | null;

  created_at?: string | null;
};

type EditFormState = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  is_active: boolean;
  account_type: AccountType;
  subscription_status: SubscriptionStatus;
};

function buildDeviceLabel(user: UserRow) {
  const parts: string[] = [];
  if (user.device_type) parts.push(user.device_type);

  if (user.os_name || user.os_version) {
    const os = [user.os_name, user.os_version].filter(Boolean).join(' ');
    if (os) parts.push(os);
  }

  if (parts.length > 0) return parts.join(' • ');

  if (user.device_info) return user.device_info;

  return null;
}

export default function ManageUsersPage() {
  const supabase = supabaseBrowserClient;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      setError(null);

      // 1) Load your existing management table
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error('Manage users load error:', usersError);
        }
        setError(
          usersError.message ||
            'Could not load users. Check Supabase schema & RLS settings.',
        );
        setUsers([]);
        setLoading(false);
        return;
      }

      const baseUsers = (usersData ?? []) as UserRow[];

      // 2) Load tracking fields from public.profiles
      // IMPORTANT: Merge by email because users.id may not match profiles.id in your schema
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('email,last_login_at,device_type,os_name,os_version,last_location');

      if (profilesError) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error('Manage users profiles load error:', profilesError);
        }
        // Keep the page working even if profiles read is blocked by RLS
        setUsers(baseUsers);
        setLoading(false);
        return;
      }

      const profileMap = new Map<
        string,
        {
          last_login_at?: string | null;
          device_type?: string | null;
          os_name?: string | null;
          os_version?: string | null;
          last_location?: string | null;
        }
      >();

      (profilesData ?? []).forEach(p => {
        const key = (p.email || '').toString().trim().toLowerCase();
        if (!key) return;

        profileMap.set(key, {
          last_login_at: p.last_login_at ?? null,
          device_type: p.device_type ?? null,
          os_name: p.os_name ?? null,
          os_version: p.os_version ?? null,
          last_location: p.last_location ?? null,
        });
      });

      const merged = baseUsers.map(u => {
        const key = (u.email || '').toString().trim().toLowerCase();
        const prof = key ? profileMap.get(key) : undefined;
        if (!prof) return u;

        return {
          ...u,
          last_login_at: prof.last_login_at ?? u.last_login_at ?? null,
          device_type: prof.device_type ?? u.device_type ?? null,
          os_name: prof.os_name ?? u.os_name ?? null,
          os_version: prof.os_version ?? u.os_version ?? null,
          last_location: prof.last_location ?? u.last_location ?? null,
        };
      });

      setUsers(merged);
      setLoading(false);
    };

    loadUsers();
  }, [supabase]);

  const openEdit = (user: UserRow) => {
    setEditingUser({
      id: user.id,
      email: user.email,
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      is_admin: !!user.is_admin,
      is_active: user.is_active ?? true,
      account_type: (user.account_type ?? 'free') as AccountType,
      subscription_status: (user.subscription_status ?? 'inactive') as SubscriptionStatus,
    });
  };

  const closeEdit = () => {
    setEditingUser(null);
    setSaving(false);
  };

  const handleEditChange = (field: keyof EditFormState, value: any) => {
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
      const {
        id,
        email,
        first_name,
        last_name,
        is_admin,
        is_active,
        account_type,
        subscription_status,
      } = editingUser;

      const { error: updateError } = await supabase
        .from('users')
        .update({
          email: email.trim(),
          first_name: first_name.trim() || null,
          last_name: last_name.trim() || null,
          is_admin,
          is_active,
          account_type,
          subscription_status,
        })
        .eq('id', id);

      if (updateError) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error('Manage users update error:', updateError);
        }
        setError(updateError.message || 'Could not save user changes.');
        setSaving(false);
        return;
      }

      setUsers(prev =>
        prev.map(u =>
          u.id === id
            ? {
                ...u,
                email: email.trim(),
                first_name: first_name.trim() || null,
                last_name: last_name.trim() || null,
                is_admin,
                is_active,
                account_type,
                subscription_status,
              }
            : u,
        ),
      );

      setSaving(false);
      closeEdit();
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('Manage users unexpected error:', err);
      }
      setError(err?.message || 'Unexpected error while saving user.');
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);

    try {
      const { error: deleteError } = await supabase.from('users').delete().eq('id', id);

      if (deleteError) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.error('Manage users delete error:', deleteError);
        }
        setError(deleteError.message || 'Could not delete user.');
        return;
      }

      setUsers(prev => prev.filter(u => u.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('Manage users unexpected delete error:', err);
      }
      setError(err?.message || 'Unexpected error while deleting user.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Manage Users</h1>
            <p className="text-sm text-slate-300">
              View and update AgentFlow user accounts, subscription status, and access.
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-8 text-slate-300">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="mt-8 text-slate-300">No users found.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Active</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Admin</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Created</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-800 hover:bg-slate-800/60"
                  >
                    <td className="px-3 py-2 align-middle">{user.email}</td>
                    <td className="px-3 py-2 align-middle">
                      {(user.first_name || user.last_name) ? (
                        <>
                          {user.first_name} {user.last_name}
                        </>
                      ) : (
                        <span className="text-slate-400 italic">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle">{user.account_type ?? 'free'}</td>
                    <td className="px-3 py-2 align-middle">{user.subscription_status ?? 'inactive'}</td>
                    <td className="px-3 py-2 align-middle">
                      {user.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-900/60 px-2 py-0.5 text-xs text-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle">{user.is_admin ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 align-middle">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2 align-middle text-right space-x-2">
                      <button
                        className="rounded-md bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                        onClick={() => openEdit(user)}
                      >
                        View / Edit
                      </button>
                      <button
                        className="rounded-md bg-red-900 px-2 py-1 text-xs hover:bg-red-800"
                        onClick={() => setDeleteConfirmId(user.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-2">Delete User</h2>
              <p className="text-sm text-slate-200 mb-4">
                Are you sure you want to permanently delete this user? This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md bg-red-700 hover:bg-red-600"
                  onClick={() => handleDelete(deleteConfirmId)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {editingUser && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-semibold mb-4">User Details</h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={editingUser.email}
                    onChange={e => handleEditChange('email', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">First Name</label>
                    <input
                      type="text"
                      className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editingUser.first_name}
                      onChange={e => handleEditChange('first_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Last Name</label>
                    <input
                      type="text"
                      className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editingUser.last_name}
                      onChange={e => handleEditChange('last_name', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Account Type</label>
                    <select
                      className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editingUser.account_type}
                      onChange={e => handleEditChange('account_type', e.target.value as AccountType)}
                    >
                      <option value="free">Free</option>
                      <option value="trial">Trial</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Subscription Status</label>
                    <select
                      className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editingUser.subscription_status}
                      onChange={e =>
                        handleEditChange('subscription_status', e.target.value as SubscriptionStatus)
                      }
                    >
                      <option value="inactive">Inactive</option>
                      <option value="trial">Trial</option>
                      <option value="active">Active</option>
                      <option value="past_due">Past Due</option>
                      <option value="canceled">Canceled</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="is_active"
                      type="checkbox"
                      checked={editingUser.is_active}
                      onChange={e => handleEditChange('is_active', e.target.checked)}
                    />
                    <label htmlFor="is_active" className="text-xs text-slate-300 select-none">
                      Active Account
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="is_admin"
                      type="checkbox"
                      checked={editingUser.is_admin}
                      onChange={e => handleEditChange('is_admin', e.target.checked)}
                    />
                    <label htmlFor="is_admin" className="text-xs text-slate-300 select-none">
                      Admin User
                    </label>
                  </div>
                </div>

                {(() => {
                  const user = users.find(u => u.id === editingUser.id);
                  if (!user) return null;

                  const deviceLabel = buildDeviceLabel(user);

                  return (
                    <div className="mt-4 space-y-2 text-xs text-slate-300">
                      <div>
                        <span className="font-semibold">Last Login:</span>{' '}
                        {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                      </div>
                      <div>
                        <span className="font-semibold">Device:</span> {deviceLabel || 'N/A'}
                      </div>
                      <div>
                        <span className="font-semibold">Last Location:</span>{' '}
                        {user.last_location || 'N/A'}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600"
                  onClick={closeEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

