'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowserClient } from '@/lib/supabaseClient';

const TEMP_ADMIN_EMAIL =
  process.env.NEXT_PUBLIC_TEMP_ADMIN_EMAIL || 'admin@agentflow.app';
const TEMP_ADMIN_PASSWORD =
  process.env.NEXT_PUBLIC_TEMP_ADMIN_PASSWORD || 'AgentFlowAdmin123!';

type ViewState = 'idle' | 'submitting';

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [error, setError] = useState<string | null>(null);

  // If admin session already exists, go straight to dashboard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored =
      window.localStorage.getItem('agentflow-admin-session');
    if (stored) {
      router.push('/dashboard');
    }
  }, [router]);

  const saveSession = (sessionEmail: string, isTemp = false) => {
    if (typeof window === 'undefined') return;
    const payload = {
      email: sessionEmail,
      isTemp,
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      'agentflow-admin-session',
      JSON.stringify(payload),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setViewState('submitting');

    try {
      // 1) TEMP ADMIN BACKDOOR
      if (
        email.trim().toLowerCase() ===
          TEMP_ADMIN_EMAIL.toLowerCase() &&
        password === TEMP_ADMIN_PASSWORD
      ) {
        saveSession(email.trim(), true);
        router.push('/dashboard');
        return;
      }

      // 2) SUPABASE ADMIN LOGIN
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

      // Look up this user in our "users" table to confirm admin
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error loading admin profile:', profileError);
        setError(
          'Could not confirm admin status. Check Supabase configuration.',
        );
        return;
      }

      if (!profile || !profile.is_admin) {
        setError(
          'This account does not have admin access. Ask an existing admin to grant you admin rights.',
        );
        return;
      }

      // ✅ Success
      saveSession(email.trim(), false);
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
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center justify-center mb-6">
          <div className="h-10 w-10 rounded-full bg-sky-500 flex items-center justify-center mr-3 shadow-lg">
            <span className="text-white font-bold text-lg">AF</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-50">
              AgentFlow Admin
            </h1>
            <p className="text-xs text-slate-400">
              Secure Dashboard • Internal Use Only
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Admin Email
            </label>
            <input
              type="email"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="admin@agentflow.app"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={viewState === 'submitting'}
            className="w-full flex items-center justify-center rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-semibold text-white py-2.5 transition-colors"
          >
            {viewState === 'submitting'
              ? 'Signing in...'
              : 'Sign in to Dashboard'}
          </button>

          <div className="mt-3 text-[10px] text-slate-500 text-center leading-relaxed">
            Temp admin login:
            <br />
            <span className="font-mono">
              {TEMP_ADMIN_EMAIL} / {TEMP_ADMIN_PASSWORD}
            </span>
            <br />
            We also accept Supabase accounts that have{' '}
            <span className="font-mono">users.is_admin = true</span>.
          </div>
        </form>
      </div>
    </div>
  );
}
