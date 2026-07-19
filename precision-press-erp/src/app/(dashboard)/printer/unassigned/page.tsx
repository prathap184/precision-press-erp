'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { ClipboardList, Printer, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

import { RoleUnassignedBacklog } from '@/components/dashboard/RoleUnassignedBacklog';
import { RoleGuard } from '@/lib/role-guard';

export default function PrinterUnassignedPage() {
  const { profile } = useAuth();

  return (
    <RoleGuard allowedRoles={['PRINTER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <section className="editorial-card p-8 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Printer Workspace</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-sm">
                <ClipboardList size={20} />
              </div>
              <div>
                <h1 className="text-[28px] font-bold font-black tracking-tight text-primary">Unassigned Backlog</h1>
                <p className="text-sm text-slate-500">Jobs waiting for printer acceptance.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/printer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-50">
              Open Dashboard <ArrowRight size={12} />
            </Link>
            <Link href="/printer/queue" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-black">
              Production Queue <Printer size={12} />
            </Link>
          </div>
        </section>

        <RoleUnassignedBacklog 
          role="PRINTER" 
          printerCategory={profile?.printerCategory}
          maxHeight="none" 
        />
      </div>
    </RoleGuard>
  );
}
