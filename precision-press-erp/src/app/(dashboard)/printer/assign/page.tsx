'use client';
export const dynamic = 'force-dynamic';

import React from 'react';

import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';

export default function PrinterAssignPage() {
  const { user, profile } = useAuth();

  return (
    <RoleGuard allowedRoles={['PRINTER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <RoleActiveJobs
          role="PRINTER"
          printerCategory={profile?.printerCategory}
          maxHeight="none"
          title="Orders Completed by Me"
          subtitle="Orders you marked as Work Done and passed to next stage"
          emptyMessage="No completed printer orders by this account yet."
          dataMode="printer-completed-by-me"
          assignedByUserId={user?.uid}
          orderHrefBuilder={(job) => `/printer/orders/${job.id}?returnTo=/admin/orders`}
        />
      </div>
    </RoleGuard>
  );
}
