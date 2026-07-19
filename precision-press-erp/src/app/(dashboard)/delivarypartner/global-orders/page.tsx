'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { DeliveryGlobalOrders } from '@/components/dashboard/DeliveryGlobalOrders';
import { DeliveryOrderActionPanel } from '@/components/dashboard/DeliveryOrderActionPanel';

export default function DeliveryGlobalOrdersPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  return (
    <RoleGuard allowedRoles={['DELIVERY', 'ADMIN', 'MANAGER']} redirectTo="/delivarypartner">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Delivery Hub</p>
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tight flex items-center gap-3">
              <ClipboardList className="w-7 h-7" />
              Global Orders
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Open delivery-related orders and their current workflow stages.</p>
          </div>

          <Link
            href="/delivarypartner"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm hover:border-slate-900 hover:text-slate-900 transition-all"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>
        </div>

        {orderId && <DeliveryOrderActionPanel orderId={orderId} />}

        <DeliveryGlobalOrders />
      </div>
    </RoleGuard>
  );
}
