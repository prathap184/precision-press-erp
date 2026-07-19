'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { DeliveryOrderActionPanel } from '@/components/dashboard/DeliveryOrderActionPanel';

export default function DeliveryOrderPage() {
  const params = useParams();
  const id = params?.id as string;

  return (
    <RoleGuard allowedRoles={['DELIVERY', 'ADMIN', 'MANAGER']} redirectTo="/delivarypartner">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Delivery Hub</p>
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tight flex items-center gap-3">
              <ClipboardList className="w-7 h-7" />
              Delivery Order
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Manage the selected delivery order here.</p>
          </div>

          <Link
            href="/delivarypartner/global-orders"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm hover:border-slate-900 hover:text-slate-900 transition-all"
          >
            <ArrowLeft size={14} />
            Back to Global Orders
          </Link>
        </div>

        <DeliveryOrderActionPanel orderId={id} />
      </div>
    </RoleGuard>
  );
}