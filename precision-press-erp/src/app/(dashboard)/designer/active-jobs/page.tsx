'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, Palette } from 'lucide-react';

import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';

export default function DesignerActiveJobsPage() {
  const { user, profile } = useAuth();

  return (
    <RoleGuard allowedRoles={['DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <section className="editorial-card p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Designer Workspace</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-sm">
                <Activity size={20} />
              </div>
              <div>
                <h1 className="text-[28px] font-bold font-black tracking-tight text-primary">Active Jobs</h1>
                <p className="text-sm text-slate-500">Jobs assigned to you in the design workflow.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/designer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-50">
              Open Dashboard <ArrowRight size={12} />
            </Link>
            <Link href="/designer/all-active-jobs" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-black">
              All Active Jobs <Palette size={12} />
            </Link>
          </div>
        </section>

        <RoleActiveJobs
          role="DESIGNER"
          userId={user?.uid || profile?.uid}
          activeScope="mine"
          maxHeight="none"
          title="Active Jobs"
          subtitle="Jobs assigned to you"
          emptyMessage="No jobs assigned to you."
          orderHrefBuilder={(job) => `/admin/orders/${job.id}?returnTo=/admin/orders`}
        />
      </div>
    </RoleGuard>
  );
}
