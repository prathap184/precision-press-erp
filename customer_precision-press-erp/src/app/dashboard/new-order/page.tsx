'use client';


import React from 'react';
import { OrderBuilder } from '@/components/dashboard/OrderBuilder';
import { RoleGuard } from '@/lib/role-guard';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewOrderPage() {
  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Breadcrumb / Back */}
        <div className="flex items-center gap-6">
          <Link 
            href="/customer" 
            className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm hover:shadow-md transition-all active:scale-95"
          >
            <ChevronLeft size={20} />
          </Link>
          <div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-1">Operational Flow</p>
            <h1 className="text-3xl font-black font-display text-primary tracking-tighter">Initialize New Print Job</h1>
          </div>
        </div>

        {/* The Engine */}
        <React.Suspense fallback={<div className="p-20 text-center font-black animate-pulse uppercase tracking-[0.4em] opacity-40">Initializing Engine...</div>}>
          <OrderBuilder />
        </React.Suspense>

      </div>
    </RoleGuard>
  );
}
