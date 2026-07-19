'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect } from 'react';
import { ControlCenter } from '@/components/dashboard/ControlCenter';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { ShieldCheck, Activity } from 'lucide-react';
import { StaffRole, ALL_STAFF_ROLES } from '@/types/roles';
import { useRouter } from 'next/navigation';

export default function StaffDashboardPage() {
  const { roles, profile } = useAuth();
   const router = useRouter();
   const primaryRole = (profile?.role as StaffRole) || null;
   const switchableRoles = primaryRole ? roles.filter((r) => r !== primaryRole) : roles;
   const visibleRoles = switchableRoles.length > 0 ? switchableRoles : roles;

   useEffect(() => {
      if (primaryRole === 'DELIVERY') {
         router.replace('/delivarypartner');
      }
   }, [primaryRole, router]);

   if (primaryRole === 'DELIVERY') {
      return null;
   }

  return (
   <RoleGuard allowedRoles={ALL_STAFF_ROLES}>
      <div className="space-y-6">
        {/* Compact Header */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-3 rounded border border-slate-200">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-900 rounded text-white shadow-sm">
                 <ShieldCheck size={18} />
              </div>
              <div>
                 <h1 className="text-sm font-black text-slate-900 uppercase tracking-wider">Staff Command Center</h1>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight opacity-70">Welcome back, {profile?.name || 'Officer'}</p>
              </div>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="text-right border-r border-slate-200 pr-3">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-0.5">Terminal Active</p>
                 <p className="text-[10px] font-bold text-slate-900 leading-none">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-200 text-indigo-600">
                 <Activity size={14} className="animate-pulse" />
              </div>
           </div>
        </section>

        <ControlCenter 
               allowedRoles={visibleRoles} 
          title="My Dashboards"
          subtitle="Select a module to access your assigned workstation."
        />
      </div>
    </RoleGuard>
  );
}
