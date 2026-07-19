'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@hindustan/shared/types/auth';

// ─── Cookie config ────────────────────────────────────────────────────────────
// Uses separate cookie names from the ERP to prevent session conflicts.
const COOKIE_OPTS = {
  path: '/',
  expires: 7,
  sameSite: 'lax' as const,
  // Only use secure cookies if explicitly enabled via env var.
  // Default is false because the server runs on HTTP (not HTTPS).
  // Set NEXT_PUBLIC_COOKIE_SECURE=true in .env.local when HTTPS is enabled.
  secure: process.env.NEXT_PUBLIC_COOKIE_SECURE === 'true',
};

const SESSION_COOKIE  = 'customer_session';
const ROLE_COOKIE     = 'customer_role';
const REFRESH_COOKIE  = 'customer_refresh';

// ─── ERP URL ──────────────────────────────────────────────────────────────────
const ERP_URL = process.env.NEXT_PUBLIC_ERP_URL || 'http://localhost:3000';

// ─── Types ────────────────────────────────────────────────────────────────────
type AuthContextValue = {
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  user: any; // Backward compatibility
  role: string | null; // Backward compatibility
  roles: any[]; // Backward compatibility
  isAdmin?: boolean; // Backward compatibility
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Profile normalization ────────────────────────────────────────────────────
function normalizeProfile(row: Record<string, any> | null, sessionUser: any): UserProfile | null {
  if (!sessionUser) return null;
  const profileRow = row ?? {
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.user_metadata?.name ?? sessionUser.email ?? 'Customer',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    customerType: 'CASH',
    creditLimit: 0,
    usedCredit: 0,
  };

  const parsedAddresses = Array.isArray(profileRow.addresses)
    ? profileRow.addresses
    : typeof profileRow.addresses === 'string'
      ? (() => { try { return JSON.parse(profileRow.addresses); } catch { return undefined; } })()
      : undefined;

  return {
    uid: profileRow.uid ?? profileRow.id ?? sessionUser.id,
    email: profileRow.email ?? sessionUser.email ?? '',
    name: profileRow.name ?? sessionUser.user_metadata?.name ?? sessionUser.email ?? 'Customer',
    displayName: profileRow.displayName ?? profileRow.name ?? undefined,
    photoURL: profileRow.photoURL ?? sessionUser.user_metadata?.avatar_url ?? undefined,
    role: profileRow.role ?? 'CUSTOMER',
    status: profileRow.status ?? 'ACTIVE',
    customerType: profileRow.customerType ?? 'CASH',
    creditLimit: Number(profileRow.creditLimit ?? 0),
    usedCredit: Number(profileRow.usedCredit ?? 0),
    creditStatus: profileRow.creditStatus ?? undefined,
    businessName: profileRow.businessName ?? undefined,
    company_name: profileRow.company_name ?? undefined,
    phone: profileRow.phone ?? undefined,
    address: profileRow.address ?? undefined,
    addresses: parsedAddresses,
    defaultAddressId: profileRow.defaultAddressId ?? undefined,
    gstType: profileRow.gstType ?? undefined,
    gstNumber: profileRow.gstNumber ?? undefined,
    gstVerified: profileRow.gstVerified ?? undefined,
    voucherType: profileRow.voucherType ?? undefined,
    membership: profileRow.membership ?? undefined,
    billing_address_line1: profileRow.billing_address_line1 ?? undefined,
    billing_city: profileRow.billing_city ?? undefined,
    billing_state: profileRow.billing_state ?? undefined,
    billing_pincode: profileRow.billing_pincode ?? undefined,
    billing_country: profileRow.billing_country ?? undefined,
    shipping_address_line1: profileRow.shipping_address_line1 ?? undefined,
    shipping_city: profileRow.shipping_city ?? undefined,
    shipping_state: profileRow.shipping_state ?? undefined,
    shipping_pincode: profileRow.shipping_pincode ?? undefined,
    createdAt: profileRow.createdAt ?? null,
    updatedAt: profileRow.updatedAt ?? null,
    lastLogin: profileRow.lastLogin ?? null,
  } as UserProfile;
}

async function fetchProfile(sessionUser: any): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionUser.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizeProfile(data, sessionUser);
}

// ─── AuthProvider ─────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const syncFromSession = async (session: any | null) => {
    if (!session?.user) {
      setProfile(null);
      setUser(null);
      Cookies.remove(SESSION_COOKIE, { path: '/' });
      Cookies.remove(ROLE_COOKIE, { path: '/' });
      Cookies.remove(REFRESH_COOKIE, { path: '/' });
      setLoading(false);
      return;
    }

    try {
      const nextProfile = await fetchProfile(session.user);

      // ── Security Gate ──────────────────────────────────────────────────────
      // If this is a STAFF account, kick them out to the ERP immediately.
      if (nextProfile && nextProfile.role !== 'CUSTOMER') {
        await supabase.auth.signOut();
        setProfile(null);
        setUser(null);
        Cookies.remove(SESSION_COOKIE, { path: '/' });
        Cookies.remove(ROLE_COOKIE, { path: '/' });
        router.replace(`/login?error=staff_account`);
        return;
      }

      setProfile(nextProfile);
      setUser(session.user);
      Cookies.set(SESSION_COOKIE,  session.access_token,    COOKIE_OPTS);
      Cookies.set(REFRESH_COOKIE,  session.refresh_token ?? '', COOKIE_OPTS);
      Cookies.set(ROLE_COOKIE,     nextProfile?.role ?? 'CUSTOMER', COOKIE_OPTS);
    } catch (err) {
      console.error('[CustomerAuth] Failed to fetch profile:', err);
      setProfile(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) void syncFromSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const nextProfile = await fetchProfile(data.user);

    // ── Staff trying to log in here? Block immediately. ───────────────────
    if (nextProfile && nextProfile.role !== 'CUSTOMER') {
      await supabase.auth.signOut();
      throw new Error('STAFF_ACCOUNT'); // Caught by login page to show redirect UI
    }

    setProfile(nextProfile);
    setUser(data.user);
    Cookies.set(SESSION_COOKIE, data.session!.access_token, COOKIE_OPTS);
    Cookies.set(REFRESH_COOKIE, data.session!.refresh_token ?? '', COOKIE_OPTS);
    Cookies.set(ROLE_COOKIE, nextProfile?.role ?? 'CUSTOMER', COOKIE_OPTS);

    return nextProfile!;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    Cookies.remove(SESSION_COOKIE, { path: '/' });
    Cookies.remove(ROLE_COOKIE,    { path: '/' });
    Cookies.remove(REFRESH_COOKIE, { path: '/' });
    router.replace('/login');
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      const nextProfile = await fetchProfile(data.session.user);
      setProfile(nextProfile);
      setUser(data.session.user);
      if (nextProfile?.role) Cookies.set(ROLE_COOKIE, nextProfile.role, COOKIE_OPTS);
    }
  };

  const value = useMemo<AuthContextValue>(() => ({
    profile,
    loading,
    login,
    logout,
    refreshProfile,
    user,
    role: profile?.role ?? null,
    roles: profile?.role ? [profile.role] : [],
    isAdmin: false
  }), [profile, loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Re-export ERP_URL so login page can use it
export { ERP_URL };
