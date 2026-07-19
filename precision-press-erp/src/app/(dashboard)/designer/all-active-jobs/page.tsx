'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { ClipboardList, ArrowRight, Palette } from 'lucide-react';

import { RoleGuard } from '@/lib/role-guard';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';

export default function DesignerAllActiveJobsPage() {
  return (
    <RoleGuard allowedRoles={['DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <section className="editorial-card p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Designer Workspace</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-sm">
                <ClipboardList size={20} />
              </div>
              <div>
                <h1 className="text-[28px] font-bold font-black tracking-tight text-primary">All Active Jobs</h1>
                <p className="text-sm text-slate-500">Every active job currently flowing through design.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/designer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-50">
              Open Dashboard <ArrowRight size={12} />
            </Link>
            <Link href="/designer/active-jobs" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-black">
              Active Jobs <Palette size={12} />
            </Link>
          </div>
        </section>

        <RoleActiveJobs
          role="DESIGNER"
          activeScope="all"
          maxHeight="none"
          title="All Active Jobs"
          subtitle="All design-stage jobs"
          emptyMessage="No active design jobs."
          orderHrefBuilder={(job) => `/admin/orders/${job.id}?returnTo=/admin/orders`}
        />
      </div>
    </RoleGuard>
  );
}
