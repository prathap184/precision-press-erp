'use client';

/**
 * IMPERSONATION LAYOUT
 * --------------------
 * Mounts ImpersonationProvider at the /admin/control/impersonate route level.
 * This means the context persists as the admin navigates between:
 *   /admin/control/impersonate  (search/select customer)
 *   /customer/orders            (view customer's orders as admin)
 *   /customer/ledger            etc.
 *
 * NOTE: Because Next.js App Router layouts are scoped per-route-segment,
 * the context will be lost when navigating to /customer/* routes.
 * For full cross-route persistence, the ImpersonationProvider should be
 * lifted to the root dashboard layout. See Phase 3 plan.
 *
 * Current Phase 2b: Context works within /admin/control/impersonate/* subtree.
 * The customer pages /customer/* read effectiveUserId via useEffectiveUser(profile?.uid),
 * which falls back to the real user when no provider is present — safe by design.
 */

import { useAuth } from '@/lib/auth-context';
import { ImpersonationProvider } from '@/lib/impersonation-context';

export default function ImpersonateLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ImpersonationProvider adminUid={user?.uid ?? null}>
      {children}
    </ImpersonationProvider>
  );
}
