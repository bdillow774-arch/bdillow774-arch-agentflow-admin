// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from '@/lib/supabaseConfig';

// IMPORTANT: Server-only. Do not import this into client components.
export const supabaseAdmin = createClient(
  getSupabaseUrl(),
  getSupabaseServiceRoleKey(),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
