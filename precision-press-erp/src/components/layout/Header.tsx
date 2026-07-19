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
    <header className="h-16 px-4 md:px-6 bg-[var(--google-card)] border-b border-[var(--google-border)] sticky top-0 z-40 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <button className={`${controlSize} rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-50 hover:text-primary transition-all`}>
          <ArrowLeft size={isAccountantPage ? 16 : 18} />
        </button>
        <div>
          <h2 className="text-xl text-[var(--google-text)] font-normal">{getPageTitle()}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`${subtitleSize} font-black text-on-surface-variant/30 uppercase tracking-widest`}>PIXEL MARKETING Intelligence / Terminal Alpha</span>
          </div>
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
        <div className="px-5 py-2 rounded-full bg-emerald-50/80 backdrop-blur-md border border-emerald-100 flex items-center gap-2.5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
            You are now {getCurrentDashboardRole()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 px-6 border-r border-slate-100">
          <button className={`${controlSize} rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-primary transition-all relative`}>
            <Bell size={isAccountantPage ? 16 : 18} />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>
          <button className={`${controlSize} rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-primary transition-all`}>
            <History size={isAccountantPage ? 16 : 18} />
          </button>
          <button className={`${controlSize} rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-primary transition-all`}>
            <Printer size={isAccountantPage ? 16 : 18} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 border-r border-slate-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-4 h-11.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors">
              <LogOut size={13} className="text-red-400" strokeWidth={2.5} />
            </span>
            Terminate Session
          </button>
        </div>

        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="text-right">
            <p className="text-[10px] font-black text-primary uppercase tracking-tight leading-none">{profile?.displayName || 'User'}</p>
            <p className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest mt-1">
              {effectiveRole}
              {simulatedRole && <span className="ml-2 text-blue-500 font-black italic">(Simulated)</span>}
            </p>
          </div>
          {(simulatedRole || viewMode === 'CUSTOMER') && (
            <button 
              onClick={() => {
                setSimulatedRole?.(null);
                stopImpersonation?.();
              }}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-blue-100 transition-colors"
            >
              Reset to Admin
            </button>
          )}
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-100 shadow-sm transition-all group-hover:border-primary">
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
