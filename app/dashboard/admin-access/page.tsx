'use client';

import { useEffect, useMemo, useState } from 'react';

type AdminRow = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  linked_app_user?: boolean;
};

type CreateFormState = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

type EditFormState = {
  id: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  linked_app_user: boolean;
};

export default function AdminAccessPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateFormState>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/admin/dashboard-admins', {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || 'Could not load dashboard admins.');
        }

        setAdmins((payload.admins ?? []) as AdminRow[]);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || 'Could not load dashboard admins.');
      } finally {
        setLoading(false);
      }
    };

    void loadAdmins();
  }, []);

  const activeAdmins = useMemo(() => admins, [admins]);

  const handleCreateAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/dashboard-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Could not create dashboard admin.');
      }

      setAdmins((prev) => [
        {
          id: payload.admin.id,
          email: payload.admin.email,
          first_name: form.firstName.trim() || null,
          last_name: form.lastName.trim() || null,
          is_active: true,
          created_at: payload.admin.created_at ?? new Date().toISOString(),
          linked_app_user: false,
        },
        ...prev.filter((admin) => admin.id !== payload.admin.id),
      ]);
      setForm({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
      });
      setMessage(
        'Dashboard access created. This does not create an app user unless that email is also used in the app.',
      );
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Could not create dashboard admin.');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (admin: AdminRow) => {
    setEditingId(admin.id);
    setEditForm({
      id: admin.id,
      email: admin.email,
      password: '',
      first_name: admin.first_name ?? '',
      last_name: admin.last_name ?? '',
      is_active: admin.is_active ?? true,
      linked_app_user: !!admin.linked_app_user,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/dashboard-admins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editForm.id,
          email: editForm.email.trim(),
          password: editForm.password.trim() || undefined,
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          is_active: editForm.is_active,
          dashboard_admin: true,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Could not update dashboard admin.');
      }

      setAdmins((prev) =>
        prev.map((admin) =>
          admin.id === editForm.id
            ? {
                ...admin,
                email: editForm.email.trim(),
                first_name: editForm.first_name.trim() || null,
                last_name: editForm.last_name.trim() || null,
                is_active: editForm.is_active,
              }
            : admin,
        ),
      );

      setMessage(
        editForm.password.trim()
          ? 'Dashboard admin and password updated.'
          : 'Dashboard admin updated.',
      );
      cancelEdit();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Could not update dashboard admin.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAccess = async (admin: AdminRow) => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const response = await fetch('/api/admin/dashboard-admins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: admin.id }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Could not remove dashboard access.');
      }

      setAdmins((prev) => prev.filter((item) => item.id !== admin.id));
      setDeleteConfirmId(null);
      if (editingId === admin.id) cancelEdit();
      setMessage(
        payload.linkedAppUser
          ? 'Dashboard access removed. The app account was kept.'
          : 'Dashboard-only login deleted.',
      );
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Could not remove dashboard access.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Admin Access
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Admin Access controls dashboard login only. Creating access here does
            not create an app user record. App users also do not get dashboard
            access unless access is granted here.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Grant Dashboard Access
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Create a dashboard-only login, or grant dashboard access to an
              existing email already in Auth.
            </p>

            <form onSubmit={handleCreateAdmin} className="mt-5 space-y-4">
              <InputField
                label="Email Address"
                type="email"
                value={form.email}
                onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                placeholder="admin@agentflow.app"
              />
              <InputField
                label="Password"
                type="password"
                value={form.password}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, password: value }))
                }
                placeholder="Create a secure password"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <InputField
                  label="First Name"
                  value={form.firstName}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, firstName: value }))
                  }
                  placeholder="Jordan"
                />
                <InputField
                  label="Last Name"
                  value={form.lastName}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, lastName: value }))
                  }
                  placeholder="Taylor"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Create / Grant Access'}
              </button>
            </form>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Dashboard Admins
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  These accounts can sign in to the dashboard. Linked app users
                  keep their app account if access is removed.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {loading ? 'Loading...' : `${activeAdmins.length} admins`}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {!loading && activeAdmins.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No dashboard admins have been set up yet.
                </div>
              )}

              {activeAdmins.map((admin) => {
                const isEditing = editingId === admin.id && editForm;

                return (
                  <div
                    key={admin.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <InputField
                            label="Email Address"
                            type="email"
                            value={editForm.email}
                            onChange={(value) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, email: value } : prev,
                              )
                            }
                            placeholder="admin@agentflow.app"
                          />
                          <InputField
                            label="New Password"
                            type="password"
                            value={editForm.password}
                            onChange={(value) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, password: value } : prev,
                              )
                            }
                            placeholder="Leave blank to keep current password"
                          />
                          <InputField
                            label="First Name"
                            value={editForm.first_name}
                            onChange={(value) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, first_name: value } : prev,
                              )
                            }
                            placeholder="Jordan"
                          />
                          <InputField
                            label="Last Name"
                            value={editForm.last_name}
                            onChange={(value) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, last_name: value } : prev,
                              )
                            }
                            placeholder="Taylor"
                          />
                        </div>

                        <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={editForm.is_active}
                            onChange={(event) =>
                              setEditForm((prev) =>
                                prev
                                  ? { ...prev, is_active: event.target.checked }
                                  : prev,
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                          />
                          Active dashboard access
                        </label>

                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          {editForm.linked_app_user
                            ? 'This email is also linked to an app user. Removing access will keep the app account and only remove dashboard permission.'
                            : 'This is a dashboard-only login. Removing access will delete the login account.'}
                        </div>

                        <div className="flex flex-wrap justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(admin.id)}
                            className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            Remove Access
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {saving ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="font-medium text-slate-900">
                            {[admin.first_name, admin.last_name]
                              .filter(Boolean)
                              .join(' ') || admin.email}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {admin.email}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Added {formatDate(admin.created_at)}
                            {admin.linked_app_user
                              ? ' • Linked app user'
                              : ' • Dashboard-only login'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => beginEdit(admin)}
                          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                        >
                          View / Edit
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-900">
              Remove dashboard access
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {admins.find((admin) => admin.id === deleteConfirmId)?.linked_app_user
                ? 'This will remove dashboard access and keep the app account.'
                : 'This will remove dashboard access and delete the dashboard-only login.'}
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
                onClick={() => {
                  const admin = admins.find((item) => item.id === deleteConfirmId);
                  if (admin) {
                    void handleRemoveAccess(admin);
                  }
                }}
                disabled={saving}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Removing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}
