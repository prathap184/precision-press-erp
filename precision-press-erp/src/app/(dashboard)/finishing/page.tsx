'use client';

import React from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';
import { CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function FinishingDashboardPage() {
  const { profile, roles } = useAuth();

  return (
    <RoleGuard allowedRoles={['FINISHING', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-700">
        <StaffRoleSwitcher userRoles={roles} />

        <section className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="text-blue-600" size={20} />
              <h1 className="text-[28px] font-bold font-bold text-slate-800">Finishing Dashboard</h1>
            </div>
            <p className="text-sm text-slate-500">
              Upload the finishing photo first, then press Work Done to complete the order stage.
            </p>
          </div>
        </section>

        <RoleActiveJobs
          role="FINISHING"
          userId={profile?.uid}
          title="Finishing Queue"
          subtitle="Open an order to upload proof and complete the stage."
          emptyMessage="No finishing jobs available."
          maxHeight="none"
          orderHrefBuilder={(job) => `/finishing/orders/${job.id}?returnTo=${encodeURIComponent('/admin/orders?highlight=' + job.id)}`}
          activeScope="all"
        />
      </div>
    </RoleGuard>
  );
}
