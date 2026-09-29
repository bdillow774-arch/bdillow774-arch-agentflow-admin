'use client';

import { supabaseBrowserClient } from '@/lib/supabaseClient';

export async function syncDashboardSessionCookie(accessToken?: string | null) {
  let token = accessToken ?? null;

  if (!token) {
    const { data } = await supabaseBrowserClient.auth.getSession();
    token = data.session?.access_token ?? null;
  }

  if (!token) {
    return clearDashboardSessionCookie();
  }

  const response = await fetch('/api/admin/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken: token }),
  });

  if (!response.ok) {
    throw new Error('Could not establish dashboard session.');
  }
}

export async function clearDashboardSessionCookie() {
  await fetch('/api/admin/session', {
    method: 'DELETE',
  });
}
