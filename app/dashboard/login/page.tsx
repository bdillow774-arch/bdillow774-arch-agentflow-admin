'use client';

import BrandLogo from '@/app/dashboard/_components/brand-logo';
import { clearDashboardSessionCookie, syncDashboardSessionCookie } from '@/lib/adminSessionClient';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowserClient } from '@/lib/supabaseClient';

type ViewState = 'idle' | 'submitting';

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncExistingSession = async () => {
      try {
        const { data, error } = await supabaseBrowserClient.auth.getUser();

        if (error) {
          throw error;
        }

        const user = data.user;

        if (!user) {
          await clearDashboardSessionCookie();
          return;
        }

        const appMetadata = user.app_metadata ?? {};
        const userMetadata = user.user_metadata ?? {};

        const hasDashboardAccess =
          appMetadata.dashboard_admin === true ||
          userMetadata.role === 'dashboard_admin' ||
          userMetadata.role === 'admin';

        if (!hasDashboardAccess) {
          await supabaseBrowserClient.auth.signOut();
          await clearDashboardSessionCookie();
          return;
        }

        await syncDashboardSessionCookie();
        router.replace('/dashboard');
      } catch (error) {
        console.warn('Clearing stale dashboard auth session.', error);
        await supabaseBrowserClient.auth.signOut({ scope: 'local' });
        await clearDashboardSessionCookie();
      }
    };

    void syncExistingSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setViewState('submitting');

    try {
      const supabase = supabaseBrowserClient;

      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError || !data.user) {
        console.error('Admin login error:', authError);
        setError(
          authError?.message ||
            'Invalid email or password. Please try again.',
        );
        return;
      }

      const user = data.user;
      const appMetadata = user.app_metadata ?? {};
      const userMetadata = user.user_metadata ?? {};
      const hasDashboardAccess =
        appMetadata.dashboard_admin === true ||
        userMetadata.role === 'dashboard_admin' ||
        userMetadata.role === 'admin';

      if (!hasDashboardAccess) {
        await supabase.auth.signOut();
        setError(
          'This account does not have admin access. Ask an existing admin to grant you admin rights.',
        );
        return;
      }

      await syncDashboardSessionCookie(data.session?.access_token ?? null);
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Unexpected admin login error:', err);
      setError(
        err?.message ||
          'An unexpected error occurred. Please try again.',
      );
    } finally {
      setViewState('idle');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <BrandLogo variant="login" />
          <h1 className="mt-6 text-2xl font-semibold text-slate-900">
            Dashboard Login
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Sign in with an approved admin email address to access the AgentFlow dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Email Address
            </label>
            <input
              type="email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              placeholder="admin@agentflow.app"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              placeholder="••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={viewState === 'submitting'}
            className="flex w-full items-center justify-center rounded-2xl bg-sky-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {viewState === 'submitting'
              ? 'Signing in...'
              : 'Sign in to Dashboard'}
          </button>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
            Dashboard access is limited to accounts with admin access enabled in the Admin Access section.
          </div>
        </form>
      </div>
    </div>
  );
}
