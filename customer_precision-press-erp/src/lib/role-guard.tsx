'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './auth-context';

interface CustomerRoleGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  allowedRoles?: string[];
  redirectTo?: string;
}

/**
 * CustomerRoleGuard
 *
 * Wraps any page in the Customer Portal.
 * - If loading → shows nothing (prevents flash of wrong content)
 * - If not authenticated → middleware already handles redirect, but guard
 *   provides a React-side safety net.
 * - If role is not CUSTOMER → redirects to /login with an error param.
 *   (This is defense-in-depth — middleware catches this first.)
 */
export function CustomerRoleGuard({ children, fallback }: CustomerRoleGuardProps) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!profile) {
      router.replace('/login');
      return;
    }

    if (profile.role !== 'CUSTOMER') {
      // Staff somehow got here — evict them
      router.replace('/login?error=staff_account');
    }
  }, [profile, loading, router]);

  if (loading) {
    return fallback ?? (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== 'CUSTOMER') return null;

  return <>{children}</>;
}

export const RoleGuard = CustomerRoleGuard;
