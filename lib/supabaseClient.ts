// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabaseConfig';

// Safe for browser usage (anon key)
export const supabaseBrowserClient = createClient(
  getSupabaseUrl(),
  getSupabaseAnonKey(),
);
