import { supabase } from '@/lib/supabase';
import type { StaffRole } from '@/types/roles';
import type { UserProfile } from '@/types/auth';

type ProfileRow = Record<string, any>;

type AuthBootstrapResponse = {
  user?: ProfileRow | null;
  profile?: ProfileRow | null;
  error?: string;
};

function normalizeProfile(row: ProfileRow, fallbackEmail?: string | null): UserProfile {
  const roles = Array.isArray(row.roles)
    ? row.roles
    : typeof row.roles === 'string'
      ? (() => { try { return JSON.parse(row.roles); } catch { return []; } })()
      : row.role && row.role !== 'CUSTOMER'
        ? [row.role]
        : [];

  const parsedAddresses = Array.isArray(row.addresses)
    ? row.addresses
    : typeof row.addresses === 'string'
      ? (() => { try { return JSON.parse(row.addresses); } catch { return undefined; } })()
      : undefined;

  return {
    uid: row.uid ?? row.id,
    email: row.email ?? fallbackEmail ?? '',
    name: row.name ?? row.displayName ?? fallbackEmail?.split('@')[0] ?? 'User',
    displayName: row.displayName ?? row.name ?? undefined,
    photoURL: row.photoURL ?? undefined,
    role: row.role ?? 'CUSTOMER',
    roles: roles.length > 0 ? (roles as StaffRole[]) : undefined,
    printerCategory: row.printerCategory ?? row.printer_category ?? undefined,
    status: row.status ?? 'ACTIVE',
    customerType: row.customerType ?? 'CASH',
    creditLimit: Number(row.creditLimit ?? 0),
    usedCredit: Number(row.usedCredit ?? 0),
    creditStatus: row.creditStatus ?? undefined,
    businessName: row.businessName ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    houseNumber: row.houseNumber ?? undefined,
    roadName: row.roadName ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    country: row.country ?? undefined,
    pincode: row.pincode ?? undefined,
    addresses: parsedAddresses,
    defaultAddressId: row.defaultAddressId ?? undefined,
    gstType: row.gstType ?? undefined,
    gstNumber: row.gstNumber ?? undefined,
    gstVerified: row.gstVerified ?? false,
    gstDetails: row.gstDetails ?? undefined,
    voucherType: row.voucherType ?? undefined,
    membership: row.membership ?? undefined,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    lastLogin: row.lastLogin ?? null,
  } as any;
}

async function fetchProfileByIdOrEmail(userId: string, email?: string | null) {
  const byId = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (byId.error) {
    throw new Error(byId.error.message);
  }

  if (byId.data) {
    return byId.data;
  }

  if (!email) {
    return null;
  }

  const byEmail = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (byEmail.error) {
    throw new Error(byEmail.error.message);
  }

  return byEmail.data;
}

export class AuthService {
  static async login(email: string, password: string): Promise<UserProfile> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message === 'Invalid login credentials') {
        // Call bootstrap-login — it will ONLY succeed if this email already
        // has a profile in our system. Unknown emails get a 401 back.
        const bootstrapResponse = await fetch('/api/auth/bootstrap-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const bootstrapData = (await bootstrapResponse.json().catch(() => null)) as AuthBootstrapResponse | null;

        // If bootstrap rejected (unknown user, inactive account, etc.) — surface that error
        if (!bootstrapResponse.ok || bootstrapData?.error) {
          throw new Error(bootstrapData?.error || 'Invalid login credentials.');
        }

        // Bootstrap succeeded — retry sign-in with the synced password
        const retry = await supabase.auth.signInWithPassword({ email, password });
        if (retry.error) {
          throw new Error(retry.error.message);
        }

        const retryUser = retry.data.user;
        if (!retryUser) {
          throw new Error('Unable to sign in.');
        }

        const retryProfileRow = await fetchProfileByIdOrEmail(retryUser.id, retryUser.email ?? email);
        if (!retryProfileRow) {
          // Should never reach here since bootstrap already verified profile exists
          throw new Error('Account not found. Please contact admin.');
        }

        return normalizeProfile(retryProfileRow, retryUser.email);
      }

      throw new Error(error.message);
    }

    const user = data.user;
    if (!user) {
      throw new Error('Unable to sign in.');
    }

    const profileRow = await fetchProfileByIdOrEmail(user.id, user.email);

    const profile = profileRow ? normalizeProfile(profileRow, user.email) : normalizeProfile({ id: user.id, email: user.email, role: 'CUSTOMER' }, user.email);
    return profile;
  }

  static async register(payload: {
    email: string;
    password: string;
    role: string;
    name: string;
    printerCategory?: string;
    companyName?: string;
    contactPerson?: string;
    alternateMobile?: string;
    panNumber?: string;
    businessName?: string;
    phone?: string;
    address?: string;
    houseNumber?: string;
    roadName?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
    billingAddressLine1?: string;
    billingAddressLine2?: string;
    billingArea?: string;
    billingDistrict?: string;
    billingStateCode?: string;
    gstType?: 'Regular' | 'Composition' | 'Unregistered';
    gstNumber?: string;
    gstVerified?: boolean;
    gstDetails?: any;
    customerType?: 'CASH' | 'CREDIT';
    creditLimit?: number;
    voucherType?: 'Type 0' | 'Type 1';
  }): Promise<UserProfile> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as AuthBootstrapResponse | null;
    if (!response.ok || data?.error) {
      throw new Error(data?.error || 'Unable to register user.');
    }

    const profileData = data?.profile ?? data?.user ?? null;
    if (!profileData) {
      throw new Error('Unable to register user.');
    }

    return normalizeProfile(profileData, payload.email);
  }

  static async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  }
}

export default AuthService;
