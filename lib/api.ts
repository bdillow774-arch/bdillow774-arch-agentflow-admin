// api.ts
// Supabase-based API helpers for the AgentFlow mobile app.
// This file intentionally does NOT use fetch() or response.json() anywhere
// so you won't get JSON parse errors from here.

import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabaseConfig';

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_ANON_KEY = getSupabaseAnonKey();

// This client talks directly to Supabase Auth for login/register/reset.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type AuthResult = {
  email: string;
  token: string;
};

// ─────────────────────────────
// LOGIN
// ─────────────────────────────
export async function login(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    throw new Error('Email and password are required.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) {
    console.error('Supabase signIn error', error);

    if (error.message === 'Email not confirmed') {
      throw new Error(
        'Your email has not been confirmed yet. Please check your inbox for the AgentFlow confirmation email and tap the link to activate your account.'
      );
    }

    throw new Error(error.message || 'Login failed. Please try again.');
  }

  const token = data.session?.access_token ?? 'logged-in';

  return {
    email: trimmedEmail,
    token,
  };
}

// ─────────────────────────────
// REGISTER (SIGN UP)
// ─────────────────────────────
export async function register(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    throw new Error('Email and password are required.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
  });

  if (error) {
    console.error('Supabase signUp error', error);

    if (error.message.includes('already registered')) {
      throw new Error('An account with this email already exists. Try logging in instead.');
    }

    throw new Error(error.message || 'Registration failed. Please try again.');
  }

  // If email confirmation is required, this may not return a session yet.
  const token = data.session?.access_token ?? 'signed-up';

  return {
    email: trimmedEmail,
    token,
  };
}

// ─────────────────────────────
// RESET PASSWORD
// ─────────────────────────────
export async function resetPassword(email: string): Promise<void> {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    throw new Error('Please enter your email address first.');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
    // You can set a redirect URL in Supabase if you build a web reset flow.
    // redirectTo: 'https://your-site.com/reset-password',
  });

  if (error) {
    console.error('Supabase resetPassword error', error);
    throw new Error(error.message || 'Failed to send password reset email.');
  }
}

// ─────────────────────────────
// DEBUG: DIRECT LOGIN (NO SUPABASE)
// ─────────────────────────────
export async function debugDirectLogin(): Promise<AuthResult> {
  // For quick UI testing without hitting Supabase.
  return {
    email: 'demo@agentflow.app',
    token: 'debug-token',
  };
}
