'use client';

import React from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { useSearchParams } from 'next/navigation';
export const dynamic = 'force-dynamic';
import { DeliveryPendingOrders } from '@/components/dashboard/DeliveryPendingOrders';

export default function DeliveryPendingPage() {
  const searchParams = useSearchParams();
  const highlightOrderId = searchParams.get('orderId');

  return (
    <RoleGuard allowedRoles={['DELIVERY', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/staff">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Delivery Stage</p>
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tight">Pending Deliveries</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Orders currently in the delivery workflow stage.</p>
          </div>
        </div>

        <DeliveryPendingOrders />
      </div>
    </RoleGuard>
  );
}
