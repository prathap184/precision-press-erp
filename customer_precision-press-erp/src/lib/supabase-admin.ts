// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with service role key.
 * Use ONLY in API routes / server actions — never expose to client.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export default supabaseAdmin;
