// lib/supabaseAdminClient.ts
import { createClient } from '@supabase/supabase-js';
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from '@/lib/supabaseConfig';

// IMPORTANT: this file is for server-side use ONLY.
// Never import this in a client component.
export const supabaseAdminClient = createClient(
  getSupabaseUrl(),
  getSupabaseServiceRoleKey(),
);
