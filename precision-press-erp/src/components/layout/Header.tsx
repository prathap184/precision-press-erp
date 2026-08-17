'use client';

import React from 'react';
import { Bell, Search, LogOut, User, History, Printer, ArrowLeft, HelpCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useImpersonation, useEffectiveUser } from '@/lib/impersonation-context';
import { usePathname, useSearchParams } from 'next/navigation';

export const Header = () => {
  const { profile, logout } = useAuth();
  const { setSimulatedRole, simulatedRole, stopImpersonation, viewMode } = useImpersonation() || {};
  const { effectiveRole } = useEffectiveUser(profile?.uid, profile?.role);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceParam = searchParams.get('workspace');
  
  const effectivePath = workspaceParam ? `/${workspaceParam}` : pathname;
  const isAccountantPage = effectivePath.startsWith('/accountant');
  const headerHeight = isAccountantPage ? 'h-16' : 'h-20';
  const headerPadding = isAccountantPage ? 'px-6' : 'px-8';
  const controlSize = isAccountantPage ? 'w-9 h-9' : 'w-10 h-10';
  const titleSize = isAccountantPage ? 'text-xl' : 'text-2xl';
  const subtitleSize = isAccountantPage ? 'text-[8px]' : 'text-[9px]';

  const handleLogout = async () => {
    await logout();
  };

  const getPageTitle = () => {
    if (effectivePath.includes('/customer')) return 'Order Management';
    if (effectivePath.includes('/admin')) return 'Executive Control';
    if (effectivePath.includes('/acdema')) return 'ACDEMA Hub';
    if (effectivePath.includes('/manager')) return 'Production Traffic';
    if (effectivePath.includes('/printer')) return 'Job Terminal';
    if (effectivePath.includes('/accountant')) return 'Fiscal Ledger';
    if (effectivePath.includes('/delivarypartner') || effectivePath.includes('/delivery')) return 'Delivery Dashboard';
    if (effectivePath.includes('/dispatch')) return 'Dispatch Terminal';
    if (effectivePath.includes('/designer')) return 'Design Studio';
    if (effectivePath.includes('/pasting')) return 'Pasting Station';
    if (effectivePath.includes('/finishing')) return 'Finishing Station';
    return 'Command Center';
  };

  const getCurrentDashboardRole = () => {
    if (effectivePath.includes('/customer')) return 'CUSTOMER';
    if (effectivePath.includes('/admin')) return 'ADMIN';
    if (effectivePath.includes('/acdema')) return 'ACDEMA';
    if (effectivePath.includes('/manager')) return 'MANAGER';
    if (effectivePath.includes('/printer')) return 'PRINTER';
    if (effectivePath.includes('/accountant')) return 'ACCOUNTANT';
    if (effectivePath.includes('/delivarypartner') || effectivePath.includes('/delivery')) return 'DELIVERY';
    if (effectivePath.includes('/dispatch')) return 'DISPATCH';
    if (effectivePath.includes('/designer')) return 'DESIGNER';
    if (effectivePath.includes('/pasting')) return 'PASTING';
    if (effectivePath.includes('/finishing')) return 'FINISHING';
    return effectiveRole;
  };

  return (
    <header className="h-14 mx-3 md:mx-4 mt-2.5 mb-1 px-4 md:px-5 bg-white/40 backdrop-blur-2xl border border-white/60 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] sticky top-2 z-40 flex items-center justify-between transition-all">
      <div className="flex items-center gap-3">
        <button 
          onClick={() => window.history.back()}
          className="w-8 h-8 rounded-xl bg-white/60 border border-white/70 shadow-sm flex items-center justify-center text-slate-700 hover:text-blue-600 hover:bg-white hover:scale-105 transition-all backdrop-blur-md cursor-pointer shrink-0"
          title="Back"
        >
          <ArrowLeft size={15} />
        </button>
        <div>
          <h2 className="text-sm md:text-base font-bold text-slate-900 tracking-tight leading-tight">{getPageTitle()}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-medium text-slate-500">Pixel Marketing Intelligence / Terminal Alpha</span>
          </div>
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
        <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 flex items-center gap-2 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-xs font-semibold text-emerald-800">
            You are now {getCurrentDashboardRole()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 pr-3 border-r border-white/60">
          <button className="w-9 h-9 rounded-2xl bg-white/40 border border-white/50 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-white/70 hover:scale-105 transition-all backdrop-blur-md relative" title="Notifications">
            <Bell size={16} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          </button>
          <button className="w-9 h-9 rounded-2xl bg-white/40 border border-white/50 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-white/70 hover:scale-105 transition-all backdrop-blur-md" title="History">
            <History size={16} />
          </button>
          <button className="w-9 h-9 rounded-2xl bg-white/40 border border-white/50 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-white/70 hover:scale-105 transition-all backdrop-blur-md" title="Print View">
            <Printer size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 pr-3 border-r border-white/60">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-2xl text-xs font-semibold text-slate-700 bg-white/40 border border-white/50 hover:bg-red-50/80 hover:text-red-600 hover:border-red-200 transition-all backdrop-blur-md shadow-sm"
          >
            <span className="w-5 h-5 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 text-red-500">
              <LogOut size={12} strokeWidth={2.5} />
            </span>
            <span className="hidden sm:inline">Terminate Session</span>
          </button>
        </div>

        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-900 leading-tight">{profile?.displayName || 'User'}</p>
            <p className="text-[11px] font-semibold text-blue-600 mt-0.5">
              {effectiveRole}
              {simulatedRole && <span className="ml-1 text-indigo-500 italic">(Simulated)</span>}
            </p>
          </div>
          {(simulatedRole || viewMode === 'CUSTOMER') && (
            <button 
              onClick={() => {
                setSimulatedRole?.(null);
                stopImpersonation?.();
              }}
              className="px-2.5 py-1 bg-blue-50/90 text-blue-700 border border-blue-200/70 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors backdrop-blur-md shadow-sm"
            >
              Reset
            </button>
          )}
          <div className="w-9 h-9 rounded-2xl overflow-hidden border-2 border-white/80 shadow-md shadow-slate-200/50 transition-all group-hover:border-blue-400 flex-shrink-0">
            <img 
              src={profile?.photoURL || "https://lh3.googleusercontent.com/aida-public/AB6AXuDIdsZJmMIcfuo3EcXr6pT7aNYYnoNb4dKD9ME5x-hfF2XXJdBtxdLrV_fjg8OFL5MSNj4oYMa0-N3ikxBMuQrbC5uXM0ltnvuW47cMIjdZgTE--pwqGcI0jtEvrQGWFArYQfOzqTNoNYmOwp1S4MrvT3FGs-kDIWSdYj3AzWAFWVYGRYdQgcUJJZHR0UuyCmK3YFeqi-YWTlc3Sr3RrB-1glgiyTDYJVZT4pXdLQWYnEQe4r9mYmg3587f2Twzabb33BwHJhP4xZ4"} 
              alt={profile?.displayName || "Profile"} 
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </header>
  );
};
