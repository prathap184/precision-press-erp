'use client';

/**
 * IMPERSONATION CONTEXT
 * ---------------------
 * Provides Admin with ability to simulate any customer's data scope
 * WITHOUT changing the real Firebase authenticated identity.
 *
 * Rules:
 *  - realUser  → actual admin (always from Firebase auth)
 *  - simulatedUser → selected customer profile (UI-only scope switch)
 *  - All backend writes still use realUser UID from the verified token cookie
 *  - This context only affects which userId is used for READ queries on the client
 *
 * Usage in customer pages:
 *   const { effectiveUserId, isImpersonating, simulatedUser } = useEffectiveUser();
 *   // Use effectiveUserId everywhere instead of profile.uid / user.uid
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, limit } from '@/lib/supabase-firestore-shim';
import { db } from './firebase';
import { UserProfile, UserRole, getEffectiveRoles } from '@/types/auth';
import { StaffRole } from '@/types/roles';

import Cookies from 'js-cookie';

export type ViewMode = 'ADMIN' | 'CUSTOMER';

interface ImpersonationState {
  viewMode: ViewMode;
  simulatedUser: UserProfile | null;
  simulatedRole: UserRole | null;
  /** The userId to use for all read queries. Components should use this instead of user.uid directly. */
  effectiveUserId: string | null;
}

interface ImpersonationContextType extends ImpersonationState {
  startImpersonation: (customerId: string) => Promise<void>;
  stopImpersonation: () => void;
  setSimulatedRole: (role: UserRole | null) => void;
  searchCustomers: (term: string) => Promise<UserProfile[]>;
  isLoading: boolean;
  error: string | null;
}


export const ImpersonationContext = createContext<ImpersonationContextType | null>(null);

// ─── Public singleton for pages outside ImpersonationProvider ─────────────────
// Falls back gracefully when not inside an ImpersonationProvider (i.e., real customer)
const FallbackContext: ImpersonationContextType = {
  viewMode: 'ADMIN',
  simulatedUser: null,
  simulatedRole: null,
  effectiveUserId: null,
  startImpersonation: async () => {},
  stopImpersonation: () => {},
  setSimulatedRole: () => {},
  searchCustomers: async () => [],
  isLoading: false,
  error: null,
};

export const ImpersonationProvider = ({
  children,
  adminUid,
}: {
  children: React.ReactNode;
  adminUid: string | null;
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('ADMIN');
  const [simulatedUser, setSimulatedUser] = useState<UserProfile | null>(null);
  const [simulatedRole, setSimulatedRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // 1. Initial Load from Cookie (if any)
  useEffect(() => {
    const savedId = Cookies.get('simulated_user_id');
    if (savedId && !simulatedUser) {
      startImpersonation(savedId);
    }
    const savedRole = Cookies.get('simulated_role') as UserRole;
    if (savedRole && !simulatedRole) {
      setSimulatedRole(savedRole);
    }
  }, []);

  // 2. Persist to Cookie
  useEffect(() => {
    if (viewMode === 'CUSTOMER' && simulatedUser) {
      Cookies.set('simulated_user_id', simulatedUser.uid, { expires: 1 }); // 1 day
    } else {
      Cookies.remove('simulated_user_id');
    }

    if (simulatedRole) {
      Cookies.set('simulated_role', simulatedRole, { expires: 1 });
    } else {
      Cookies.remove('simulated_role');
    }
  }, [viewMode, simulatedUser, simulatedRole]);


  // The key property: components read this instead of user.uid
  const effectiveUserId =
    viewMode === 'CUSTOMER' && simulatedUser ? simulatedUser.uid : adminUid;

  const startImpersonation = useCallback(async (customerId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const profileRef = doc(db, 'profiles', customerId);
      const profileSnap = await getDoc(profileRef);

      if (!profileSnap.exists()) {
        throw new Error('Customer profile not found.');
      }

      const customerProfile = profileSnap.data() as UserProfile;

      if (customerProfile.role !== 'CUSTOMER') {
        throw new Error('Selected user is not a Customer.');
      }

      setSimulatedUser(customerProfile);
      setViewMode('CUSTOMER');
    } catch (err: any) {
      setError(err.message || 'Failed to start impersonation.');
      Cookies.remove('simulated_user_id');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopImpersonation = useCallback(() => {
    setSimulatedUser(null);
    setViewMode('ADMIN');
    setError(null);
    Cookies.remove('simulated_user_id');
  }, []);

  const searchCustomers = useCallback(async (term: string): Promise<UserProfile[]> => {
    if (!term || term.length < 2) return [];
    try {
      // Search by name prefix (Firestore limitation — no full-text search)
      const nameQuery = query(
        collection(db, 'profiles'),
        where('role', '==', 'CUSTOMER'),
        where('name', '>=', term),
        where('name', '<=', term + '\uf8ff'),
        limit(10)
      );

      // Also try phone match
      const phoneQuery = query(
        collection(db, 'profiles'),
        where('role', '==', 'CUSTOMER'),
        where('phone', '==', term),
        limit(5)
      );

      const [nameSnap, phoneSnap] = await Promise.all([getDocs(nameQuery), getDocs(phoneQuery)]);

      const results = new Map<string, UserProfile>();
      [...nameSnap.docs, ...phoneSnap.docs].forEach((d) => {
        results.set(d.id, { uid: d.id, ...d.data() } as UserProfile);
      });

      return Array.from(results.values());
    } catch {
      return [];
    }
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{
        viewMode,
        simulatedUser,
        simulatedRole,
        effectiveUserId,
        startImpersonation,
        stopImpersonation,
        setSimulatedRole,
        searchCustomers,
        isLoading,
        error,
      }}
    >
      {children}
    </ImpersonationContext.Provider>

  );
};

export const useImpersonation = (): ImpersonationContextType => {
  const context = useContext(ImpersonationContext);
  return context ?? FallbackContext;
};

/**
 * useEffectiveUser — THE CENTRAL HOOK FOR ALL CUSTOMER PAGES
 * -----------------------------------------------------------
 * Always returns the correct userId for Firestore queries.
 *
 * For real customers:      returns their own uid (profile.uid)
 * For admin impersonating: returns the simulated customer's uid
 *
 * Call pattern in customer pages:
 *   const { effectiveUserId, isImpersonating, simulatedUser } = useEffectiveUser(profile?.uid);
 *
 * Then use effectiveUserId in every query and useEffect dependency array.
 */
export function useEffectiveUser(realUid?: string | null, realRole?: UserRole | null) {
  const ctx = useContext(ImpersonationContext);

  const effectiveRole = (ctx?.simulatedRole) || realRole || null;

  if (ctx && ctx.viewMode === 'CUSTOMER' && ctx.simulatedUser) {
    return {
      effectiveUserId: ctx.simulatedUser.uid,
      effectiveRole: (ctx.simulatedUser.role as UserRole) || 'CUSTOMER',
      effectiveRoles: getEffectiveRoles(ctx.simulatedUser) as StaffRole[],
      isImpersonating: true,
      simulatedUser: ctx.simulatedUser,
      viewMode: ctx.viewMode as ViewMode,
    };
  }

  return {
    effectiveUserId: realUid ?? null,
    effectiveRole,
    effectiveRoles: [] as StaffRole[], // real roles come from useAuth().roles
    isImpersonating: !!ctx?.simulatedRole,
    simulatedUser: null,
    viewMode: (ctx?.viewMode || 'ADMIN') as ViewMode,
  };
}


