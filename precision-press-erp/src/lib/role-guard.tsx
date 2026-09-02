'use client';

/**
 * ROLE GUARD — Phase 11 / 12
 * --------------------------
 * Multi-role client-side route protection with real-time access enforcement.
 *
 * Behaviours:
 *   - ADMIN / SUPER_ADMIN bypass ALL restrictions.
 *   - Accepts `allowedRoles: StaffRole[]` — user needs ANY one match.
 *   - If roles change live (via Firestore onSnapshot) and user no longer has
 *     access, they are immediately redirected to /control-center (Phase 12).
 *   - Impersonation admin retains admin bypass.
 */

import React, { useEffect, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './auth-context';
import { StaffRole, hasAnyRole } from '@/types/roles';
import { UserRole } from '@/types/auth';
import { ImpersonationContext } from './impersonation-context';

interface RoleGuardProps {
  children: React.ReactNode;
  /** Roles that can access this content. ADMIN/SUPER_ADMIN always pass. */
  allowedRoles: (StaffRole | UserRole)[];
  /** Where to redirect on access denial. Defaults to /staff */
  redirectTo?: string;
}

export const RoleGuard = ({
  children,
  allowedRoles,
  redirectTo = '/staff',
}: RoleGuardProps): JSX.Element | null => {
  const { roles, role, user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const impCtx = useContext(ImpersonationContext);
  const isAdminImpersonating =
    isAdmin && impCtx?.viewMode === 'CUSTOMER';

  const isCustomerAndAllowed = role === 'CUSTOMER' && allowedRoles.includes('CUSTOMER');
  const allowed = isAdmin || isAdminImpersonating || isCustomerAndAllowed || hasAnyRole(roles, allowedRoles as StaffRole[]);

  // Live redirect when role is revoked or unauthorized user accesses protected page
  useEffect(() => {
    if (loading) return; // still loading
    if (!user) return; // not logged in
    if (!allowed) {
      router.replace(redirectTo);
    }
  }, [loading, user, allowed, router, redirectTo]);

  // Still loading auth state — render secure loading placeholder to prevent unauthenticated data leaks
  if (loading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Verifying Permissions...</p>
        </div>
      </div>
    );
  }

  // Admin impersonating customers gets through
  if (isAdminImpersonating) return <>{children}</>;

  // ADMIN / SUPER_ADMIN bypass all
  if (isAdmin) return <>{children}</>;

  // Permitted role
  if (allowed) return <>{children}</>;

  // Blocked — redirect is in flight via useEffect above
  return null;
};

// ─── Convenience wrapper for single-role guards ───────────────────────────────
export const AdminOnly = ({ children }: { children: React.ReactNode }) => (
  <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>{children}</RoleGuard>
);
