'use client';

import React, { useEffect, useState } from 'react';
import { supabaseBrowserClient } from '@/lib/supabaseClient';
import Link from 'next/link';

type AccountType = 'free' | 'trial' | 'paid';
type SubscriptionProvider = 'none' | 'apple' | 'google' | 'manual';
type SubscriptionStatus =
  | 'inactive'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'canceled';

type UserRow = {
  id: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  is_admin?: boolean;
  is_active?: boolean;
  account_type?: AccountType | null;
  trial_length_days?: number | null;
  trial_ends_at?: string | null;
  subscription_provider?: SubscriptionProvider | null;
  subscription_status?: SubscriptionStatus | null;
  subscription_current_period_end?: string | null;
  last_login_at?: string | null;
  last_login_device?: string | null;
  last_login_location?: string | null;
  [key: string]: any;
};

type State = 'idle' | 'loading' | 'loaded' | 'saving' | 'error';

export default function ManageUsersPage() {
  const supabase = supabaseBrowserClient;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] =
    useState<AccountType | 'all'>('all');

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      setState('loading');
      setError(null);

      try {
        const { data, error: usersErr } = await supabase
          .from('users')
          .select('*');

        if (usersErr) {
          console.error('Manage users load error:', usersErr);
          setError(
            'Could not load users from Supabase. Make sure there is a "users" table. Extra columns are optional.',
          );
          setState('error');
          return;
        }

        setUsers((data || []) as UserRow[]);
        setState('loaded');
      } catch (err) {
        console.error('Unexpected error while loading users:', err);
        setError('Unexpected error while loading users.');
        setState('error');
      }
    };

    loadUsers();
  }, [supabase]);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const accountTypeOptions: AccountType[] = ['free', 'trial', 'paid'];
  const providerOptions: SubscriptionProvider[] = [
    'none',
    'apple',
    'google',
    'manual',
  ];
  const statusOptions: SubscriptionStatus[] = [
    'inactive',
    'trial',
    'active',
    'past_due',
    'canceled',
  ];

  /** Save a single user row to Supabase */
  const saveRow = async (user: UserRow) => {
    setSavingId(user.id);
    setError(null);
    setState('saving');

    try {
      const payload: any = {
        // Basic fields (included so future edits are covered)
        email: user.email ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        phone: user.phone ?? null,

        // Flags / subscription fields
        is_admin:
          typeof user.is_admin === 'boolean' ? user.is_admin : false,
        is_active:
          typeof user.is_active === 'boolean' ? user.is_active : true,
        account_type: user.account_type || null,
        trial_length_days:
          typeof user.trial_length_days === 'number'
            ? user.trial_length_days
            : null,
        trial_ends_at: user.trial_ends_at || null,
        subscription_provider: user.subscription_provider || 'none',
        subscription_status: user.subscription_status || 'inactive',
        subscription_current_period_end:
          user.subscription_current_period_end || null,
      };

      const { error: updateErr } = await supabase
        .from('users')
        .update(payload)
        .eq('id', user.id);

      if (updateErr) {
        console.error('Manage users update error:', updateErr);
        setError(
          'Could not update user. Check that the "users" table is writable and RLS policies allow this update.',
        );
        setState('error');
      } else {
        setState('loaded');
      }
    } catch (err) {
      console.error('Unexpected error while updating user record:', err);
      setError('Unexpected error while updating user record.');
      setState('error');
    } finally {
      setSavingId(null);
    }
  };

  /**
   * Update local state AND immediately persist to Supabase.
   * This keeps UI and DB in sync without relying on the Save button.
   */
  const handleToggleField = (
    id: string,
    field: keyof UserRow,
    value: any,
  ) => {
    let updatedUser: UserRow | null = null;

    // Update table rows
    setUsers(prev =>
      prev.map(u => {
        if (u.id === id) {
          updatedUser = { ...u, [field]: value };
          return updatedUser;
        }
        return u;
      }),
    );

    // Update modal copy if it's the same user
    setSelectedUser(prev => {
      if (prev && prev.id === id) {
        const next = { ...prev, [field]: value };
        updatedUser = next;
        return next;
      }
      return prev;
    });

    // Persist to Supabase
    if (updatedUser) {
      void saveRow(updatedUser);
    }
  };

  const deleteRow = async (user: UserRow) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the user "${user.email || user.id}"?\n\nThis will delete the profile row in the "users" table.\nThe auth account in Supabase (auth.users) will still exist until you remove it via a server-side function.`,
    );
    if (!confirmed) return;

    setDeletingId(user.id);
    setError(null);

    try {
      const { error: delErr } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (delErr) {
        console.error('Manage users delete error:', delErr);
        setError(
          'Could not delete user. Make sure the "users" table is writable and RLS policies allow deletes.',
        );
      } else {
        setUsers(prev => prev.filter(u => u.id !== user.id));
        if (selectedUser && selectedUser.id === user.id) {
          setSelectedUser(null);
          setShowDetail(false);
        }
      }
    } catch (err) {
      console.error('Unexpected error while deleting user:', err);
      setError('Unexpected error while deleting user.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = users.filter(u => {
    const text = filterText.toLowerCase().trim();
    const email = (u.email || '').toLowerCase();
    const firstName = (u.first_name || '').toLowerCase();
    const lastName = (u.last_name || '').toLowerCase();
    const phone = (u.phone || '').toLowerCase();

    if (text) {
      const haystack = [email, firstName, lastName, phone].join(' ');
      if (!haystack.includes(text)) return false;
    }

    if (accountTypeFilter !== 'all') {
      const atype: AccountType =
        (u.account_type as AccountType) || 'free';
      return atype === accountTypeFilter;
    }

    return true;
  });

  const openDetail = (user: UserRow) => {
    setSelectedUser(user);
    setShowDetail(true);
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold tracking-wide">
              Manage Users
            </h1>
            <p className="text-[11px] text-slate-400">
              View app accounts, subscription status, and admin flags.
            </p>
          </div>
          <Link
            href="/dashboard/users/create"
            className="inline-flex items-center rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-white px-3 py-1.5"
          >
            + Create User
          </Link>
        </div>
      </div>

      {/* Filters & table */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        {error && (
          <div className="mb-3 rounded-lg border border-red-700 bg-red-900/25 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Search by name, email, or phone"
            className="w-full sm:w-64 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />

          <select
            value={accountTypeFilter}
            onChange={e =>
              setAccountTypeFilter(
                e.target.value as AccountType | 'all',
              )
            }
            className="w-32 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          >
            <option value="all">All types</option>
            <option value="free">Free</option>
            <option value="trial">Trial</option>
            <option value="paid">Paid</option>
          </select>

          <div className="text-[11px] text-slate-500 ml-auto">
            {state === 'loading'
              ? 'Loading users…'
              : `${filteredUsers.length} of ${users.length} users`}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="min-w-full text-[11px]">
            <thead className="bg-slate-900/80 border-b border-slate-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-400">
                  User
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">
                  Account
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">
                  Subscription
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">
                  Last Login
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-400">
                  Admin / Active
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-400">
                  Save
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    No users match your filters.
                  </td>
                </tr>
              )}

              {filteredUsers.map(user => {
                const firstName = user.first_name || '';
                const lastName = user.last_name || '';
                const email = user.email || '';
                const phone = user.phone || '';
                const atype: AccountType =
                  (user.account_type as AccountType) || 'free';
                const provider: SubscriptionProvider =
                  (user.subscription_provider as SubscriptionProvider) ||
                  'none';
                const status: SubscriptionStatus =
                  (user.subscription_status as SubscriptionStatus) ||
                  'inactive';

                return (
                  <tr
                    key={user.id}
                    className="border-t border-slate-800/80 hover:bg-slate-900/80"
                  >
                    {/* USER (clickable to open detail) */}
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => openDetail(user)}
                        className="text-left w-full"
                      >
                        <div className="font-semibold text-slate-100 underline decoration-dotted">
                          {firstName || lastName ? (
                            <>
                              {firstName} {lastName}
                            </>
                          ) : (
                            <span className="italic text-slate-400">
                              No name
                            </span>
                          )}
                        </div>
                        <div className="text-sky-300">{email}</div>
                        {phone ? (
                          <div className="text-slate-400">{phone}</div>
                        ) : null}
                      </button>
                    </td>

                    {/* ACCOUNT */}
                    <td className="px-3 py-2 align-top">
                      <div className="mb-1">
                        <label className="block text-slate-400 mb-0.5">
                          Type
                        </label>
                        <select
                          value={atype}
                          onChange={e =>
                            handleToggleField(
                              user.id,
                              'account_type',
                              e.target.value as AccountType,
                            )
                          }
                          className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        >
                          {accountTypeOptions.map(t => (
                            <option key={t} value={t}>
                              {t === 'free'
                                ? 'Free'
                                : t === 'trial'
                                ? 'Trial'
                                : 'Paid'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {atype === 'trial' && (
                        <>
                          <div className="mt-1">
                            <label className="block text-slate-400 mb-0.5">
                              Trial Ends
                            </label>
                            <div className="text-slate-200">
                              {formatDate(user.trial_ends_at)}
                            </div>
                          </div>
                          <div className="mt-1">
                            <label className="block text-slate-400 mb-0.5">
                              Trial Length (days)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={user.trial_length_days ?? ''}
                              onChange={e =>
                                handleToggleField(
                                  user.id,
                                  'trial_length_days',
                                  e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                )
                              }
                              className="w-20 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                            />
                          </div>
                        </>
                      )}
                    </td>

                    {/* SUBSCRIPTION */}
                    <td className="px-3 py-2 align-top">
                      <div className="mb-1">
                        <label className="block text-slate-400 mb-0.5">
                          Provider
                        </label>
                        <select
                          value={provider}
                          onChange={e =>
                            handleToggleField(
                              user.id,
                              'subscription_provider',
                              e.target.value as SubscriptionProvider,
                            )
                          }
                          className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        >
                          {providerOptions.map(p => (
                            <option key={p} value={p}>
                              {p === 'none'
                                ? 'None / Not Linked'
                                : p === 'apple'
                                ? 'Apple App Store'
                                : p === 'google'
                                ? 'Google Play'
                                : 'Manual / Back-office'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-1">
                        <label className="block text-slate-400 mb-0.5">
                          Status
                        </label>
                        <select
                          value={status}
                          onChange={e =>
                            handleToggleField(
                              user.id,
                              'subscription_status',
                              e.target.value as SubscriptionStatus,
                            )
                          }
                          className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        >
                          {statusOptions.map(s => (
                            <option key={s} value={s}>
                              {s === 'inactive'
                                ? 'Inactive'
                                : s === 'trial'
                                ? 'Trial'
                                : s === 'active'
                                ? 'Active'
                                : s === 'past_due'
                                ? 'Past Due'
                                : 'Canceled'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-1">
                        <label className="block text-slate-400 mb-0.5">
                          Current Period Ends
                        </label>
                        <div className="text-slate-200">
                          {formatDate(user.subscription_current_period_end)}
                        </div>
                      </div>
                    </td>

                    {/* LAST LOGIN */}
                    <td className="px-3 py-2 align-top">
                      <div className="mb-1">
                        <div className="text-slate-400 mb-0.5">
                          Last Login
                        </div>
                        <div className="text-slate-200">
                          {formatDateTime(user.last_login_at)}
                        </div>
                      </div>
                      {user.last_login_device && (
                        <div className="mb-1 text-slate-400">
                          Device:{' '}
                          <span className="text-slate-200">
                            {user.last_login_device}
                          </span>
                        </div>
                      )}
                      {user.last_login_location && (
                        <div className="text-slate-400">
                          Location:{' '}
                          <span className="text-slate-200">
                            {user.last_login_location}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* ADMIN / ACTIVE */}
                    <td className="px-3 py-2 align-top">
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          id={`admin-${user.id}`}
                          type="checkbox"
                          checked={!!user.is_admin}
                          onChange={e =>
                            handleToggleField(
                              user.id,
                              'is_admin',
                              e.target.checked,
                            )
                          }
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                        />
                        <label
                          htmlFor={`admin-${user.id}`}
                          className="text-[11px] text-slate-200"
                        >
                          Admin
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id={`active-${user.id}`}
                          type="checkbox"
                          checked={
                            user.is_active === undefined
                              ? true
                              : !!user.is_active
                          }
                          onChange={e =>
                            handleToggleField(
                              user.id,
                              'is_active',
                              e.target.checked,
                            )
                          }
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                        />
                        <label
                          htmlFor={`active-${user.id}`}
                          className="text-[11px] text-slate-200"
                        >
                          Active (can log in)
                        </label>
                      </div>
                    </td>

                    {/* SAVE (manual backup) */}
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        type="button"
                        onClick={() => saveRow(user)}
                        disabled={savingId === user.id}
                        className="inline-flex items-center rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-[11px] font-semibold text-white px-3 py-1.5"
                      >
                        {savingId === user.id ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          Note: To fully delete a user&apos;s auth account from Supabase
          (auth.users), you&apos;ll later add a server-side function that
          runs with the service role key. This page currently deletes the
          profile row in the <span className="font-mono">users</span> table
          and lets you soft-disable an account via the &quot;Active&quot;
          switch.
        </p>
      </div>

      {/* Detail Modal */}
      {showDetail && selectedUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <div className="text-xs text-slate-400">User Details</div>
                <div className="text-sm font-semibold text-slate-50">
                  {selectedUser.first_name || selectedUser.last_name
                    ? `${selectedUser.first_name || ''} ${
                        selectedUser.last_name || ''
                      }`
                    : selectedUser.email || selectedUser.id}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-3 text-[11px] space-y-3 max-h-[70vh] overflow-y-auto">
              {/* Basic info */}
              <div>
                <div className="text-slate-400 mb-1">Basic Info</div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 space-y-1">
                  <div>
                    <span className="text-slate-400">Email: </span>
                    <span className="text-sky-300">
                      {selectedUser.email || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Name: </span>
                    <span className="text-slate-200">
                      {selectedUser.first_name || selectedUser.last_name
                        ? `${selectedUser.first_name || ''} ${
                            selectedUser.last_name || ''
                          }`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Phone: </span>
                    <span className="text-slate-200">
                      {selectedUser.phone || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Account & Trial (editable) */}
              <div>
                <div className="text-slate-400 mb-1">
                  Account & Trial (Editable)
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 space-y-2">
                  <div>
                    <label className="block text-slate-400 mb-0.5">
                      Account Type
                    </label>
                    <select
                      value={
                        (selectedUser.account_type as AccountType) || 'free'
                      }
                      onChange={e =>
                        handleToggleField(
                          selectedUser.id,
                          'account_type',
                          e.target.value as AccountType,
                        )
                      }
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    >
                      {accountTypeOptions.map(t => (
                        <option key={t} value={t}>
                          {t === 'free'
                            ? 'Free'
                            : t === 'trial'
                            ? 'Trial'
                            : 'Paid'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-slate-400">Trial Ends: </span>
                    <span className="text-slate-200">
                      {formatDate(selectedUser.trial_ends_at)}
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-0.5">
                      Trial Length (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={selectedUser.trial_length_days ?? ''}
                      onChange={e =>
                        handleToggleField(
                          selectedUser.id,
                          'trial_length_days',
                          e.target.value
                            ? Number(e.target.value)
                            : null,
                        )
                      }
                      className="w-24 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Subscription (editable) */}
              <div>
                <div className="text-slate-400 mb-1">
                  Subscription Info (Editable)
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 space-y-2">
                  <div>
                    <label className="block text-slate-400 mb-0.5">
                      Provider
                    </label>
                    <select
                      value={
                        (selectedUser.subscription_provider as SubscriptionProvider) ||
                        'none'
                      }
                      onChange={e =>
                        handleToggleField(
                          selectedUser.id,
                          'subscription_provider',
                          e.target.value as SubscriptionProvider,
                        )
                      }
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    >
                      {providerOptions.map(p => (
                        <option key={p} value={p}>
                          {p === 'none'
                            ? 'None / Not Linked'
                            : p === 'apple'
                            ? 'Apple App Store'
                            : p === 'google'
                            ? 'Google Play'
                            : 'Manual / Back-office'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-0.5">
                      Status
                    </label>
                    <select
                      value={
                        (selectedUser.subscription_status as SubscriptionStatus) ||
                        'inactive'
                      }
                      onChange={e =>
                        handleToggleField(
                          selectedUser.id,
                          'subscription_status',
                          e.target.value as SubscriptionStatus,
                        )
                      }
                      className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                    >
                      {statusOptions.map(s => (
                        <option key={s} value={s}>
                          {s === 'inactive'
                            ? 'Inactive'
                            : s === 'trial'
                            ? 'Trial'
                            : s === 'active'
                            ? 'Active'
                            : s === 'past_due'
                            ? 'Past Due'
                            : 'Canceled'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-slate-400">
                      Current Period Ends:{' '}
                    </span>
                    <span className="text-slate-200">
                      {formatDate(
                        selectedUser.subscription_current_period_end,
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Flags & last login */}
              <div>
                <div className="text-slate-400 mb-1">
                  Flags & Last Login
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selectedUser.is_admin}
                        onChange={e =>
                          handleToggleField(
                            selectedUser.id,
                            'is_admin',
                            e.target.checked,
                          )
                        }
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                      />
                      <span className="text-slate-200">Admin</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={
                          selectedUser.is_active === false
                            ? false
                            : true
                        }
                        onChange={e =>
                          handleToggleField(
                            selectedUser.id,
                            'is_active',
                            e.target.checked,
                          )
                        }
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
                      />
                      <span className="text-slate-200">
                        Active (can log in)
                      </span>
                    </label>
                  </div>

                  <div>
                    <span className="text-slate-400">Last Login: </span>
                    <span className="text-slate-200">
                      {formatDateTime(selectedUser.last_login_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Device: </span>
                    <span className="text-slate-200">
                      {selectedUser.last_login_device || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Location: </span>
                    <span className="text-slate-200">
                      {selectedUser.last_login_location || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-900/80">
              <button
                type="button"
                onClick={() => {
                  if (selectedUser) {
                    deleteRow(selectedUser);
                  }
                }}
                disabled={
                  !!deletingId &&
                  selectedUser &&
                  deletingId === selectedUser.id
                }
                className="inline-flex items-center rounded-md border border-red-600 text-[11px] font-semibold text-red-200 px-3 py-1.5 hover:bg-red-900/40 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {selectedUser && deletingId === selectedUser.id
                  ? 'Deleting…'
                  : 'Delete User'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="inline-flex items-center rounded-md border border-slate-600 text-[11px] font-semibold text-slate-200 px-3 py-1.5 hover:bg-slate-800/80"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selectedUser && saveRow(selectedUser)
                  }
                  disabled={
                    !!savingId &&
                    selectedUser &&
                    savingId === selectedUser.id
                  }
                  className="inline-flex items-center rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-[11px] font-semibold text-white px-3 py-1.5"
                >
                  {selectedUser && savingId === selectedUser.id
                    ? 'Saving…'
                    : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
