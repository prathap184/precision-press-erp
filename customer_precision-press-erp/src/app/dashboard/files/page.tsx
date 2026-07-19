'use client';


import React from 'react';
import { PackageCheck, Search, Filter, Download } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';

export default function FileLibraryPage() {
  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="flex justify-between items-end px-4">
          <div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-4">Asset Management</p>
            <h1 className="text-4xl font-black font-display text-primary tracking-tighter uppercase">File Library</h1>
          </div>
          <div className="flex gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search designs..." 
                className="bg-white border-none rounded-2xl pl-12 pr-6 py-4 text-xs font-bold text-primary shadow-sm outline-none focus:ring-4 focus:ring-primary/5 transition-all w-64"
              />
            </div>
            <button className="bg-white p-4 rounded-2xl shadow-sm text-primary hover:text-secondary transition-colors">
              <Filter size={18} />
            </button>
          </div>
        </header>

        <section className="bg-white rounded-[3rem] p-12 shadow-sm border border-surface-container-low min-h-[400px] flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-[2rem] bg-surface-container-low flex items-center justify-center text-primary/20 mb-6">
            <PackageCheck size={40} />
          </div>
          <h2 className="text-2xl font-black text-primary tracking-tight mb-2">No files registered yet</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest max-w-xs">
            Your print-ready designs will appear here once you place your first order.
          </p>
        </section>
      </div>
    </RoleGuard>
  );
}
