'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useAuth } from '@/lib/auth-context';

import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';
import { RoleGuard } from '@/lib/role-guard';

export default function PrinterOrdersPage() {
  const { profile } = useAuth();
  
  return (
    <RoleGuard allowedRoles={['PRINTER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <RoleActiveJobs
          role="PRINTER"
          printerCategory={profile?.printerCategory}
          maxHeight="none"
          title="All Assigned Orders"
          subtitle="Open any job to view the printer detail page"
          emptyMessage="No assigned orders available."
          orderHrefBuilder={(job) => `/printer/orders/${job.id}?returnTo=/admin/orders`}
        />
      </div>
    </RoleGuard>
  );
}
