'use client';
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { Truck, ClipboardList } from 'lucide-react';
import { WorkflowTaskQueue } from '@/components/production/WorkflowTaskQueue';
import { Order } from '@/types/models';
import { useSearchParams } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { StaffRole } from '@/types/roles';
import { DeliveryGlobalOrders } from '@/components/dashboard/DeliveryGlobalOrders';
import Link from 'next/link';

export default function DeliveryPartnerDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0 });
  const searchParams = useSearchParams();
  const highlightOrderId = searchParams.get('orderId');

  const handleTasksChange = (tasks: Order[]) => {
    const pending = tasks.filter(
      (task) => task.workflowSnapshot?.steps[task.workflowSnapshot.currentStepIndex]?.status === 'PENDING'
    ).length;
    const inProgress = tasks.filter(
      (task) => task.workflowSnapshot?.steps[task.workflowSnapshot.currentStepIndex]?.status === 'IN_PROGRESS'
    ).length;
    setStats({ total: tasks.length, pending, inProgress });
  };

  return (
    <RoleGuard allowedRoles={['DELIVERY', 'ADMIN', 'MANAGER']} redirectTo="/delivarypartner">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <StaffRoleSwitcher userRoles={(profile?.roles as StaffRole[]) || []} />

        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4">Delivery Hub</p>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic">Delivery Partner Dashboard</h1>
            <p className="text-gray-500 font-medium mt-2 max-w-lg">
              Manage final mile deliveries, customer handovers, and route progress from a single dashboard.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <Link
              href="/delivarypartner/global-orders"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm hover:border-slate-900 hover:text-slate-900 transition-all"
            >
              <ClipboardList size={14} />
              Global Orders
            </Link>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned Orders</p>
              <p className="text-2xl font-black text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pending</p>
              <p className="text-2xl font-black text-amber-600">{stats.pending}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">In Transit</p>
              <p className="text-2xl font-black text-green-600">{stats.inProgress}</p>
            </div>
          </div>
          </div>
        </section>

        <DeliveryGlobalOrders />

        <WorkflowTaskQueue
          role="DELIVERY"
          title="Delivery Orders"
          icon={<Truck className="w-6 h-6" />}
          onTasksChange={handleTasksChange}
          highlightOrderId={highlightOrderId}
          orderHrefBuilder={(order) => `/delivarypartner/orders/${order.id}?returnTo=${encodeURIComponent('/admin/orders?highlight=' + order.id)}`}
        />
      </div>
    </RoleGuard>
  );
}
