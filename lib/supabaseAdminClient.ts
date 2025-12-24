// lib/supabaseAdminClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// IMPORTANT: this file is for server-side use ONLY.
// Never import this in a client component.
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars'
  );
}

export const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey);
