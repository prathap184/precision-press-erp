'use client';

import React from 'react';
import { Bell, Search, LogOut, User, History, Printer, ArrowLeft, HelpCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { usePathname } from 'next/navigation';

export const Header = () => {
  const { profile, logout } = useAuth();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
  };

  const getPageTitle = () => {
    if (pathname === '/' || pathname === '/dashboard') return 'My Dashboard';
    if (pathname.startsWith('/dashboard/orders') || pathname.startsWith('/dashboard/multi-order') || pathname.startsWith('/dashboard/categories') || pathname.startsWith('/dashboard/new-order')) return 'Order Management';
    if (pathname.startsWith('/dashboard/cart')) return 'My Cart';
    if (pathname.startsWith('/dashboard/ledger')) return 'Account Ledger';
    if (pathname.startsWith('/dashboard/payment') || pathname.startsWith('/dashboard/request-payment')) return 'Payments';
    if (pathname.startsWith('/dashboard/profile')) return 'My Profile';
    if (pathname.startsWith('/dashboard/documents')) return 'My Documents';
    return 'Customer Portal';
  };

  return (
    <header className="h-20 px-4 md:px-8 bg-[var(--google-card)] border-b border-[var(--google-border)] sticky top-0 z-40 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-50 hover:text-primary transition-all">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-2xl text-[var(--google-text)] font-normal">{getPageTitle()}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-widest">Hindustan Enterprices / Customer Portal</span>
          </div>
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
        <div className="px-5 py-2 rounded-full bg-emerald-50/80 backdrop-blur-md border border-emerald-100 flex items-center gap-2.5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
            CUSTOMER ACCOUNT
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 px-6 border-r border-slate-100">
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-primary transition-all relative">
            <Bell size={18} />
          </button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-primary transition-all">
            <History size={18} />
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
            Logout
          </button>
        </div>

        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="text-right">
            <p className="text-[10px] font-black text-primary uppercase tracking-tight leading-none">{profile?.displayName || 'User'}</p>
            <p className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-widest mt-1">
              CUSTOMER
            </p>
          </div>
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
