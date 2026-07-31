'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// This page is linked from the sidebar as "Accounting".
// It reads the current Supabase session, picks up the access_token,
// and redirects the user to Dubbl with that token so they are
// automatically signed in there without a second login.

const DUBBL_URL = process.env.NEXT_PUBLIC_DUBBL_URL || 'http://localhost:3001';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AccountingRedirectPage() {
  useEffect(() => {
    async function redirect() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        // Not logged in — send to Dubbl sign-in page
        window.location.href = `${DUBBL_URL}/sign-in`;
        return;
      }

      // Build the Dubbl SSO URL with token and orgId
      const params = new URLSearchParams({
        token: session.access_token,
      });

      window.location.href = `${DUBBL_URL}/supabase-auth?${params.toString()}`;
    }

    redirect();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500">Opening Accounting...</p>
      </div>
    </div>
  );
}
