'use client';

import Cookies from 'js-cookie';
import { supabase } from '@/lib/supabase';

const COOKIE_OPTS = {
  path: '/',
  expires: 7,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export async function refreshAuthTokenCookie() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error('You are signed out. Please log in again.');
  }

  Cookies.set('token', data.session.access_token, COOKIE_OPTS);
  return data.session.access_token;
}
