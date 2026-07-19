'use client';

import React, { useState } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';
import { Scissors } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function PastingDashboardPage() {
  const { profile, roles } = useAuth();
  const [activeTab, setActiveTab] = useState<'pending' | 'completed-by-me' | 'all-completed'>('pending');

  const tabs = [
    {
      id: 'pending',
      label: 'Pending',
      title: 'Pasting Queue',
      subtitle: 'Open an order to upload proof and complete the stage.',
      dataMode: 'role-workflow' as const,
      activeScope: 'all' as const,
      emptyMessage: 'No pasting jobs available.',
    },
    {
      id: 'completed-by-me',
      label: 'Completed by Me',
      title: 'Pasting Work Completed by Me',
      subtitle: 'Orders you have completed at the pasting stage.',
      dataMode: 'role-completed-by-me' as const,
      activeScope: 'all' as const,
      emptyMessage: 'No pasting jobs completed by you yet.',
    },
    {
      id: 'all-completed',
      label: 'All Completed',
      title: 'All Completed Pasting Work',
      subtitle: 'Every order completed at the pasting stage.',
      dataMode: 'role-completed-all' as const,
      activeScope: 'all' as const,
      emptyMessage: 'No completed pasting jobs yet.',
    },
  ];

  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <RoleGuard allowedRoles={['PASTING', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-700">
        <StaffRoleSwitcher userRoles={roles} />

        <section className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Scissors className="text-teal-600" size={20} />
              <h1 className="text-[28px] font-bold font-bold text-slate-800">Pasting Dashboard</h1>
            </div>
            <p className="text-sm text-slate-500">
              Upload the stage photo first, then press Work Done to move the order to the next step.
            </p>
          </div>
        </section>

        <section className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeTab === tab.id ? 'border-teal-500 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <RoleActiveJobs
          role="PASTING"
          userId={profile?.uid}
          title={activeTabConfig.title}
          subtitle={activeTabConfig.subtitle}
          emptyMessage={activeTabConfig.emptyMessage}
          dataMode={activeTabConfig.dataMode}
          activeScope={activeTabConfig.activeScope}
          maxHeight="none"
          orderHrefBuilder={(job) => `/pasting/orders/${job.id}?returnTo=${encodeURIComponent('/admin/orders?highlight=' + job.id)}`}
        />
      </div>
    </RoleGuard>
  );
}
