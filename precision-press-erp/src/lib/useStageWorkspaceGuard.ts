'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { StaffRole } from '@/types/roles';
import { Order } from '@/types/models';
import { toast } from 'react-hot-toast';

export interface StageWorkspaceGuardResult {
  isChecking: boolean;
  allowed: boolean;
  errorReason: 'ADMIN_ONLY' | 'ROLE_UNAUTHORIZED' | 'STAGE_LOCKED' | null;
  errorMessage: string | null;
  fallbackUrl: string;
}

export function getFallbackOrdersUrl(roles: StaffRole[] = [], role?: string | null): string {
  if (roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') || role === 'ADMIN' || role === 'SUPER_ADMIN') return '/admin/orders';
  if (roles.includes('PRINTER') || role === 'PRINTER') return '/printer/orders';
  if (roles.includes('PASTING') || role === 'PASTING') return '/pasting/orders';
  if (roles.includes('FINISHING') || role === 'FINISHING') return '/finishing/orders';
  if (roles.includes('DISPATCH') || role === 'DISPATCH') return '/dispatch/orders';
  if (roles.includes('DESIGNER') || role === 'DESIGNER') return '/designer/orders';
  if (roles.includes('MANAGER') || role === 'MANAGER') return '/manager/orders';
  return '/global-orders';
}

/**
 * Universal stage workspace guard:
 * 1. Checks if the URL has returnTo=/admin/... and user is not admin -> immediately redirects to global orders.
 * 2. Checks if user has the assigned role for the stage -> if not, immediately redirects to global orders.
 * 3. Checks if preceding stages are completed -> if not, immediately redirects to global orders.
 */
export function useStageWorkspaceGuard(
  stageRole: StaffRole,
  order: Order | null,
  orderLoading: boolean
): StageWorkspaceGuardResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, roles, role, isAdmin, loading: authLoading } = useAuth();

  const returnTo = searchParams ? searchParams.get('returnTo') : null;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

  const safeReturnTo = useMemo(() => {
    if (!returnTo) return null;
    const lower = returnTo.toLowerCase();
    if (lower.includes('/admin')) return null;
    if (returnTo.startsWith('/') && !returnTo.startsWith('//')) return returnTo;
    return null;
  }, [returnTo]);

  const fallbackUrl = useMemo(() => {
    return safeReturnTo || getFallbackOrdersUrl(roles, role);
  }, [safeReturnTo, roles, role]);

  // 1. Admin URL check: If returnTo contains /admin, or current path is /admin, only ADMIN or SUPER_ADMIN can use it
  const isUserAdmin = Boolean(
    isAdmin ||
    roles.includes('ADMIN') ||
    roles.includes('SUPER_ADMIN') ||
    role === 'ADMIN' ||
    role === 'SUPER_ADMIN'
  );
  const isAdminSpecificUrl = Boolean(returnTo && returnTo.toLowerCase().includes('/admin'));
  const isAdminPath = Boolean(pathname && pathname.toLowerCase().startsWith('/admin'));

  // 2. Stage Role Assignment check
  const acdemaManagedRoles: StaffRole[] = ['ACCOUNTANT', 'DESIGNER', 'MANAGER'];
  const isAcdema = roles.includes('ACDEMA') || role === 'ACDEMA';
  const hasAssignedRole = Boolean(
    isUserAdmin ||
    roles.includes(stageRole) ||
    role === stageRole ||
    roles.includes('MANAGER') ||
    role === 'MANAGER' ||
    (isAcdema && acdemaManagedRoles.includes(stageRole))
  );

  // 3. Stage readiness check
  const stageStatus = useMemo(() => {
    if (!order) return { isReady: true, currentStepLabel: '' };
    const snapshot = order.workflowSnapshot;
    if (!snapshot || !Array.isArray(snapshot.steps) || snapshot.steps.length === 0) {
      // Fallback status check when workflow steps are not materialized
      const st = String(order.status || '').toUpperCase();
      if (stageRole === 'DISPATCH') {
        const notReadyStatuses = ['PENDING', 'CONFIRMED', 'ASSIGNED', 'PRINTING', 'PRINT_QUEUE', 'PASTING', 'FINISHING'];
        if (notReadyStatuses.includes(st)) {
          return { isReady: false, currentStepLabel: st };
        }
      }
      return { isReady: true, currentStepLabel: '' };
    }

    const stepIndex = snapshot.steps.findIndex(s => s.role === stageRole);
    if (stepIndex === -1) {
      return { isReady: true, currentStepLabel: '' };
    }

    const currentStepIndex = typeof snapshot.currentStepIndex === 'number' ? snapshot.currentStepIndex : 0;
    const targetStep = snapshot.steps[stepIndex];
    const currentStep = snapshot.steps[currentStepIndex];

    const isCompleted = stepIndex < currentStepIndex || targetStep?.status === 'COMPLETED';
    const isCurrent = stepIndex === currentStepIndex && targetStep?.status !== 'COMPLETED';

    if (!isCompleted && !isCurrent) {
      return {
        isReady: false,
        currentStepLabel: currentStep?.label || currentStep?.role || 'earlier',
      };
    }

    return { isReady: true, currentStepLabel: '' };
  }, [order, stageRole]);

  // Combined Check result
  const checkResult = useMemo((): {
    allowed: boolean;
    reason: 'ADMIN_ONLY' | 'ROLE_UNAUTHORIZED' | 'STAGE_LOCKED' | null;
    message: string | null;
  } => {
    if (authLoading) {
      return { allowed: true, reason: null, message: null };
    }

    // A) Admin URL check: If URL has returnTo pointing to admin and caller is not admin,
    //    or if current pathname starts with /admin and caller is not admin
    if ((isAdminSpecificUrl || isAdminPath) && !isUserAdmin) {
      return {
        allowed: false,
        reason: 'ADMIN_ONLY',
        message: 'Admin URL cannot be accessed by non-admin accounts. Redirected to your orders page.',
      };
    }

    // B) Role authorization check: caller must have stage role assigned
    if (!hasAssignedRole) {
      return {
        allowed: false,
        reason: 'ROLE_UNAUTHORIZED',
        message: `Access Denied: Your account is not assigned the ${stageRole} role.`,
      };
    }

    // C) Order stage completion check: preceding stages must be finished
    if (!orderLoading && order && !stageStatus.isReady) {
      return {
        allowed: false,
        reason: 'STAGE_LOCKED',
        message: `Stage Locked: Order #${order.id.replace('ORD-', '')} is currently at the ${stageStatus.currentStepLabel} stage. Preceding stages must be completed first.`,
      };
    }

    return { allowed: true, reason: null, message: null };
  }, [authLoading, isAdminSpecificUrl, isAdminPath, isUserAdmin, hasAssignedRole, orderLoading, order, stageStatus, stageRole]);

  // Enforce redirection when not allowed
  useEffect(() => {
    if (authLoading) return;
    if (!checkResult.allowed && checkResult.message) {
      toast.error(checkResult.message, { id: 'workspace-guard-error' });
      router.replace(fallbackUrl);
    }
  }, [authLoading, checkResult, fallbackUrl, router]);

  return {
    isChecking: authLoading || (orderLoading && !checkResult.reason),
    allowed: checkResult.allowed,
    errorReason: checkResult.reason,
    errorMessage: checkResult.message,
    fallbackUrl,
  };
}
