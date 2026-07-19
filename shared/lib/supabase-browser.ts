import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// Browser/client-side: always use the anon key (safe for public use)
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Browser Supabase client — safe to use in both ERP and Customer Portal.
 * Uses the ANON key only. Never the service role key.
 *
 * The ERP's server-side operations (admin SDK, workflow) should use
 * supabase-admin.ts which is in the ERP only and never exposed to the customer portal.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const createBrowserClient = () => createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
