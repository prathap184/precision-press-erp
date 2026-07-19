'use client';
export const dynamic = 'force-dynamic';

import React, { Suspense } from 'react';
import AccountVerification from '@/components/dashboard/AccountVerification';
import { RoleGuard } from '@/lib/role-guard';

export default function AdminLedgerPage() {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <Suspense fallback={<div className="p-8 text-center font-black animate-pulse text-blue-900">INITIALIZING AUDIT LEDGER...</div>}>
        <AccountVerification />
      </Suspense>
    </RoleGuard>
  );
}
