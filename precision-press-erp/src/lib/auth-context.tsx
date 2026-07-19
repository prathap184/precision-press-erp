'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';
import { AuthService } from '@/services/auth';
import { getEffectiveRoles, profileHasRole, type UserProfile } from '@/types/auth';
import type { StaffRole } from '@/types/roles';

type SupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any>;
};

type Session = {
  access_token: string;
  user: SupabaseUser | null;
};

type AppUser = {
  id: string;
  uid: string;
  email: string | null;
  displayName?: string | null;
};

type AuthContextValue = {
  user: AppUser | null;
  profile: UserProfile | null;
  role: UserProfile['role'] | null;
  roles: StaffRole[];
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (email: string, password: string, role: string, name: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const COOKIE_OPTS = {
  path: '/',
  expires: 7,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

function mapSessionUser(user: SupabaseUser | null): AppUser | null {
  if (!user) return null;
  return {
    id: user.id,
    uid: user.id,
    email: user.email ?? null,
    displayName: user.user_metadata?.name ?? user.user_metadata?.display_name ?? null,
  };
}

function normalizeProfile(row: Record<string, any> | null, sessionUser: SupabaseUser | null): UserProfile | null {
  if (!sessionUser) return null;

  const profileRow = row ?? {
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.user_metadata?.name ?? sessionUser.email ?? 'User',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    customerType: 'CASH',
    creditLimit: 0,
    usedCredit: 0,
  };

  const roles = Array.isArray(profileRow.roles)
    ? profileRow.roles
    : typeof profileRow.roles === 'string'
      ? (() => { try { return JSON.parse(profileRow.roles); } catch { return []; } })()
      : profileRow.role && profileRow.role !== 'CUSTOMER'
        ? [profileRow.role]
        : [];

  const parsedAddresses = Array.isArray(profileRow.addresses)
    ? profileRow.addresses
    : typeof profileRow.addresses === 'string'
      ? (() => { try { return JSON.parse(profileRow.addresses); } catch { return undefined; } })()
      : undefined;

  return {
    uid: profileRow.uid ?? profileRow.id ?? sessionUser.id,
    email: profileRow.email ?? sessionUser.email ?? '',
    name: profileRow.name ?? profileRow.displayName ?? sessionUser.user_metadata?.name ?? sessionUser.email ?? 'User',
    displayName: profileRow.displayName ?? profileRow.name ?? sessionUser.user_metadata?.name ?? undefined,
    photoURL: profileRow.photoURL ?? sessionUser.user_metadata?.avatar_url ?? undefined,
    role: profileRow.role ?? 'CUSTOMER',
    roles: roles.length > 0 ? roles : undefined,
    status: profileRow.status ?? 'ACTIVE',
    customerType: profileRow.customerType ?? 'CASH',
    creditLimit: Number(profileRow.creditLimit ?? 0),
    usedCredit: Number(profileRow.usedCredit ?? 0),
    creditStatus: profileRow.creditStatus ?? undefined,
    businessName: profileRow.businessName ?? undefined,
    phone: profileRow.phone ?? undefined,
    address: profileRow.address ?? undefined,
    houseNumber: profileRow.houseNumber ?? undefined,
    roadName: profileRow.roadName ?? undefined,
    city: profileRow.city ?? undefined,
    state: profileRow.state ?? undefined,
    country: profileRow.country ?? undefined,
    pincode: profileRow.pincode ?? undefined,
    addresses: parsedAddresses,
    defaultAddressId: profileRow.defaultAddressId ?? undefined,
    gstType: profileRow.gstType ?? undefined,
    gstNumber: profileRow.gstNumber ?? undefined,
    voucherType: profileRow.voucherType ?? undefined,
    membership: profileRow.membership ?? undefined,
    printerCategory: profileRow.printerCategory ?? profileRow.printer_category ?? undefined,
    billing_address_line1: profileRow.billing_address_line1 ?? undefined,
    billing_address_line2: profileRow.billing_address_line2 ?? undefined,
    billing_city: profileRow.billing_city ?? undefined,
    billing_state: profileRow.billing_state ?? undefined,
    billing_pincode: profileRow.billing_pincode ?? undefined,
    billing_country: profileRow.billing_country ?? undefined,
    billing_area: profileRow.billing_area ?? undefined,
    billing_district: profileRow.billing_district ?? undefined,
    billing_state_code: profileRow.billing_state_code ?? undefined,
    shipping_address_line1: profileRow.shipping_address_line1 ?? undefined,
    shipping_address_line2: profileRow.shipping_address_line2 ?? undefined,
    shipping_city: profileRow.shipping_city ?? undefined,
    shipping_state: profileRow.shipping_state ?? undefined,
    shipping_pincode: profileRow.shipping_pincode ?? undefined,
    shipping_country: profileRow.shipping_country ?? undefined,
    shipping_area: profileRow.shipping_area ?? undefined,
    shipping_district: profileRow.shipping_district ?? undefined,
    shipping_state_code: profileRow.shipping_state_code ?? undefined,
    shipping_same_as_billing: profileRow.shipping_same_as_billing ?? undefined,
    createdAt: profileRow.createdAt ?? null,
    updatedAt: profileRow.updatedAt ?? null,
    lastLogin: profileRow.lastLogin ?? null,
  } as any;
}

async function fetchProfile(sessionUser: SupabaseUser): Promise<UserProfile | null> {
  const byId = await supabase.from('profiles').select('*').eq('id', sessionUser.id).maybeSingle();
  if (byId.error) {
    throw new Error(byId.error.message);
  }

  if (byId.data) {
    return normalizeProfile(byId.data, sessionUser);
  }

  if (sessionUser.email) {
    const byEmail = await supabase.from('profiles').select('*').eq('email', sessionUser.email).maybeSingle();
    if (byEmail.error) {
      throw new Error(byEmail.error.message);
    }
    if (byEmail.data) {
      return normalizeProfile(byEmail.data, sessionUser);
    }
  }

  return normalizeProfile(null, sessionUser);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const syncFromSession = async (nextSession: Session | null) => {
    setSession(nextSession);

    if (!nextSession?.user) {
      setUser(null);
      setProfile(null);
      Cookies.remove('token', { path: '/' });
      Cookies.remove('role', { path: '/' });
      setLoading(false);
      return;
    }

    setUser(mapSessionUser(nextSession.user));
    Cookies.set('token', nextSession.access_token, COOKIE_OPTS);

    try {
      const nextProfile = await fetchProfile(nextSession.user);
      setProfile(nextProfile);
      Cookies.set('role', nextProfile?.role ?? 'CUSTOMER', COOKIE_OPTS);
    } catch (error: any) {
      console.error('Failed to fetch user profile:', error);
      const isExpired = error?.message?.includes('JWT expired') || error?.message?.includes('expired');
      if (isExpired) {
        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          console.error('Error signing out after JWT expiry:', signOutErr);
        }
        setUser(null);
        setProfile(null);
        Cookies.remove('token', { path: '/' });
        Cookies.remove('role', { path: '/' });
      } else {
        const fallback = normalizeProfile(null, nextSession.user);
        setProfile(fallback);
        Cookies.set('role', fallback?.role ?? 'CUSTOMER', COOKIE_OPTS);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void syncFromSession(data.session);
    }).catch((error) => {
      console.error('Failed to load Supabase session:', error);
      if (mounted) {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncFromSession(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    const nextRole = profile.role;
    Cookies.set('role', nextRole, COOKIE_OPTS);
  }, [profile]);

  const login = async (email: string, password: string) => {
    const result = await AuthService.login(email, password);
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      const nextProfile = await fetchProfile(data.session.user);
      setUser(mapSessionUser(data.session.user));
      setProfile(nextProfile ?? result);
      Cookies.set('role', (nextProfile ?? result).role, COOKIE_OPTS);
      Cookies.set('token', data.session.access_token, COOKIE_OPTS);
    } else {
      setProfile(result);
    }

    if (result.role) {
      router.prefetch('/');
    }

    return result;
  };

  const register = async (email: string, password: string, role: string, name: string) => {
    const created = await AuthService.register({ email, password, role, name });
    return created;
  };

  const logout = async () => {
    await AuthService.logout();
    setSession(null);
    setUser(null);
    setProfile(null);
    Cookies.remove('token', { path: '/' });
    Cookies.remove('role', { path: '/' });
    router.push('/staff-login');
  };

  const refreshProfile = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const nextProfile = await fetchProfile(data.session.user);
        setProfile(nextProfile);
        if (nextProfile?.role) {
          Cookies.set('role', nextProfile.role, COOKIE_OPTS);
        }
      }
    } catch (error) {
      console.error('Failed to refresh user profile:', error);
    }
  };

  const value = useMemo<AuthContextValue>(() => {
    const effectiveRoles = getEffectiveRoles(profile);
    return {
      user,
      profile,
      role: profile?.role ?? null,
      roles: effectiveRoles,
      isAdmin: profileHasRole(profile, ['ADMIN', 'SUPER_ADMIN']),
      loading,
      login,
      register,
      logout,
      refreshProfile,
    };
  }, [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
