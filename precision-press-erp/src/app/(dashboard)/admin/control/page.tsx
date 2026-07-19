'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { ControlCenter } from '@/components/dashboard/ControlCenter';
import { StaffRole } from '@/types/roles';

import ManagerDashboard from '@/app/(dashboard)/manager/page';
import DesignerDashboard from '@/app/(dashboard)/designer/page';
import SupportDashboard from '@/app/(dashboard)/support/page';
import PrinterDashboard from '@/app/(dashboard)/printer/page';
import PastingDashboard from '@/app/(dashboard)/pasting/page';
import FinishingDashboard from '@/app/(dashboard)/finishing/page';
import DispatchDashboard from '@/app/(dashboard)/dispatch/page';
import AccountantDashboard from '@/app/(dashboard)/accountant/payments/page';

import { ROLE_CARDS } from '@/components/dashboard/ControlCenter';
import { useImpersonation } from '@/lib/impersonation-context';

export default function AdminControlPage() {
  const impersonation = useImpersonation();
  const setSimulatedRole = impersonation?.setSimulatedRole;
  const simulatedRole = impersonation?.simulatedRole;
  
  const [activeRoleView, setActiveRoleView] = useState<StaffRole | null>((simulatedRole as StaffRole) || null);
  const [showSelector, setShowSelector] = useState(!simulatedRole);

  // Sync with context if it changes externally
  useEffect(() => {
    if (simulatedRole) {
      setActiveRoleView(simulatedRole as StaffRole);
      setShowSelector(false);
    } else {
      setShowSelector(true);
    }
  }, [simulatedRole]);

  const handleRoleSwitch = (roleId: StaffRole) => {
    setActiveRoleView(roleId);
    setShowSelector(false);
    if (setSimulatedRole) {
      setSimulatedRole(roleId);
    }
  };

  if (showSelector) {
    return (
      <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
        <ControlCenter 
          allowedRoles={['MANAGER', 'DESIGNER', 'SUPPORT', 'PRINTER', 'PASTING', 'FINISHING', 'DISPATCH', 'ACCOUNTANT']}
          title="Control Center"
          subtitle="Select an operational domain to begin terminal simulation."
          onRoleClick={handleRoleSwitch}
          isImpersonation={true}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Tab Navigation */}
        <div className="bg-slate-100/50 p-1 rounded-xl border border-slate-200 shadow-inner flex flex-wrap gap-0.5 sticky top-2 z-40 backdrop-blur-md">
          {ROLE_CARDS.map(role => (
            <button
              key={role.id}
              onClick={() => handleRoleSwitch(role.id)}
              className={`flex-1 min-w-[110px] px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                activeRoleView === role.id
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                  : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>

        {/* View Content */}
        <div className="relative">
          <div className="mb-2 flex items-center gap-2 ml-1">
             <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-200" />
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Telemetry Active</p>
          </div>
          
          <div className="rounded-2xl border border-slate-200/60 shadow-2xl shadow-slate-200/50 bg-white min-h-[500px] overflow-hidden transition-all">
            <div className="p-0.5 animate-in fade-in zoom-in-95 duration-500">
              {activeRoleView === 'MANAGER'    && <ManagerDashboard    key="MANAGER"    />}
              {activeRoleView === 'DESIGNER'   && <DesignerDashboard   key="DESIGNER"   />}
              {activeRoleView === 'SUPPORT'    && <SupportDashboard    key="SUPPORT"    />}
              {activeRoleView === 'PRINTER'    && <PrinterDashboard    key="PRINTER"    />}
              {activeRoleView === 'PASTING'    && <PastingDashboard    key="PASTING"    />}
              {activeRoleView === 'FINISHING'  && <FinishingDashboard  key="FINISHING"  />}
              {activeRoleView === 'DISPATCH'   && <DispatchDashboard   key="DISPATCH"   />}
              {activeRoleView === 'ACCOUNTANT' && <AccountantDashboard key="ACCOUNTANT" />}
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

