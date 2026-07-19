import { StaffRole, hasAnyRole } from '@/types/roles';
import { UserRole } from '@/types/auth';

/**
 * requireRole — Phase 14 Backend Security
 * ----------------------------------------
 * Called inside every protected Server Action / API Route.
 * Reads the multi-role array from the verified JWT claims.
 *
 * Usage:
 *   requireRole(claims, ['ACCOUNTANT', 'ADMIN']);
 *
 * Throws on failure — never trust the frontend for access decisions.
 */
export function requireRole(
  userClaims: Record<string, any>,
  allowedRoles: (StaffRole | UserRole)[]
): void {
  // Support both legacy single `role` claim and new `roles` array claim
  const claimedRoles: StaffRole[] = Array.isArray(userClaims.roles)
    ? userClaims.roles
    : userClaims.role
    ? [userClaims.role as StaffRole]
    : [];

  if (claimedRoles.length === 0) {
    throw new Error('Forbidden: No role assigned');
  }

  const permitted = hasAnyRole(claimedRoles, allowedRoles as StaffRole[]);
  if (!permitted) {
    throw new Error(
      `Forbidden: requires one of [${allowedRoles.join(', ')}], has [${claimedRoles.join(', ')}]`
    );
  }
}

/**
 * requireAdmin — convenience helper for ADMIN-only server actions.
 */
export function requireAdmin(userClaims: Record<string, any>): void {
  requireRole(userClaims, ['ADMIN', 'SUPER_ADMIN']);
}
