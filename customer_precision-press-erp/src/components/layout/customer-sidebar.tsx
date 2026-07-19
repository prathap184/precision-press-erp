'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  PackageSearch, 
  Heart, 
  FileText, 
  CreditCard,
  User,
  LogOut,
  Printer,
  Plus
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CustomerSidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export function CustomerSidebar({ isExpanded, onToggle }: CustomerSidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const visualExpanded = isExpanded || isHovered;
  
  const pathname = usePathname();
  const { logout, profile } = useAuth();

  const mainItems = [
    { name: 'Browse Products', href: '/dashboard/categories', icon: LayoutDashboard },
    { name: 'My Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'All Orders', href: '/dashboard/orders', icon: PackageSearch },
    { name: 'Quotations', href: '/dashboard/quotations', icon: FileText },
  ];

  const accountItems = [
    { name: 'Cart', href: '/dashboard/cart', icon: ShoppingCart },
    { name: 'Account Ledger', href: '/dashboard/ledger', icon: CreditCard },
    { name: 'Report Payment', href: '/dashboard/payment', icon: FileText },
    { name: 'Request Payment', href: '/dashboard/request-payment', icon: CreditCard },
    { name: 'Membership', href: '/dashboard/membership', icon: User },
    { name: 'My Profile', href: '/dashboard/profile', icon: User },
    { name: 'My Documents', href: '/dashboard/documents', icon: FileText },
  ];

  const NavLink = ({ item }: { item: { name: string, href: string, icon: any } }) => {
    const isActive = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={!visualExpanded ? item.name : undefined}
        className={cn(
          'flex items-center gap-4 py-2.5 transition-all duration-200 overflow-hidden whitespace-nowrap',
          visualExpanded ? 'px-6 mr-4 rounded-r-full' : 'px-0 justify-center mx-2 rounded-full',
          isActive
            ? 'font-semibold bg-[#e8f0fe] text-[#174ea6]'
            : 'text-slate-600 hover:bg-[#f1f3f4]'
        )}
      >
        <span className={cn(
          'flex items-center justify-center w-6 h-6 flex-shrink-0 transition-all duration-200',
          isActive ? 'text-[#174ea6]' : 'text-slate-500'
        )}>
          <item.icon size={20} className={isActive ? 'text-[#174ea6]' : 'text-slate-500'} strokeWidth={2} />
        </span>
        {visualExpanded && <span className="tracking-tight text-[14px] font-medium">{item.name}</span>}
      </Link>
    );
  };

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'fixed top-0 left-0 h-full bg-white border-r border-slate-200 text-slate-800 transition-all duration-300 z-50 flex flex-col overflow-hidden shadow-sm',
        visualExpanded ? 'w-[280px]' : 'w-[72px]'
      )}
    >
      {/* HEADER */}
      <div className={cn(
        'flex items-center flex-shrink-0',
        visualExpanded ? 'justify-between px-6 py-5 gap-3' : 'justify-center py-5'
      )}>
        {visualExpanded && (
          <Link href="/" className="flex items-center gap-3 overflow-hidden min-w-0 hover:opacity-80 transition-opacity">
            <img 
              src="/logo.png" 
              alt="Pixel Marketing Logo" 
              className="w-12 h-12 rounded-xl object-contain shadow-md flex-shrink-0"
            />
            <div className="overflow-hidden flex flex-col justify-center">
              <h1 className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 font-black text-sm tracking-widest uppercase truncate leading-tight whitespace-nowrap">Pixel Marketing</h1>
            </div>
          </Link>
        )}
        {!visualExpanded && (
          <img 
            src="/logo.png" 
            alt="Pixel Marketing Logo" 
            className="w-12 h-12 rounded-xl object-contain shadow-md flex-shrink-0 mt-1"
          />
        )}
      </div>

      {/* NEW PRINT JOB CTA */}
      <div className={cn('pt-2 pb-4 flex-shrink-0', visualExpanded ? 'px-3' : 'px-2')}>
        <Link
          href="/dashboard/categories"
          title={!visualExpanded ? 'New Print Job' : undefined}
          className={cn(
            'flex items-center gap-3 py-3 rounded-2xl font-medium text-sm transition-all overflow-hidden whitespace-nowrap',
            'bg-[#4285f4] text-white hover:bg-[#3367d6] hover:shadow-md shadow-sm',
            visualExpanded ? 'px-5 justify-start ml-2 mr-3' : 'px-0 justify-center w-12 h-12 mx-auto'
          )}
        >
          <Plus size={20} strokeWidth={2.5} className="flex-shrink-0" />
          {visualExpanded && <span className="font-bold text-[11px] tracking-wider uppercase">New Print Job</span>}
        </Link>
      </div>

      {/* SCROLLABLE NAV */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="pb-2">
          {visualExpanded && (
            <p className="text-[10px] font-bold tracking-widest text-slate-400 px-6 pb-2 pt-2 uppercase">Pages</p>
          )}
          <div className="space-y-0.5">
            {mainItems.map(item => <NavLink key={item.href} item={item} />)}
          </div>
        </div>

        <div className="pt-2 pb-2">
          {visualExpanded
            ? <p className="text-[10px] font-bold tracking-widest text-slate-400 px-6 pb-2 pt-4 uppercase">Account Pages</p>
            : <div className="border-t border-slate-200 my-2 mx-3" />
          }
          <div className="space-y-0.5">
            {accountItems.map(item => <NavLink key={item.href} item={item} />)}
          </div>
        </div>
      </div>

      {/* USER PROFILE & LOGOUT */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <div className={cn('flex items-center mb-4', visualExpanded ? 'gap-3 px-2' : 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-[#174ea6] flex items-center justify-center text-white font-bold flex-shrink-0 shadow-inner">
            {profile?.name?.charAt(0) || 'C'}
          </div>
          {visualExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{profile?.name || 'Customer'}</p>
              <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase truncate">{profile?.email || 'Customer'}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => logout()}
          className={cn(
            'flex items-center text-slate-500 rounded-lg hover:bg-slate-200 hover:text-slate-800 transition-colors',
            visualExpanded ? 'w-full px-3 py-2.5 text-sm font-medium' : 'p-2.5 justify-center w-full'
          )}
          title={!visualExpanded ? 'Log out' : undefined}
        >
          <LogOut size={18} className={cn('flex-shrink-0', visualExpanded ? 'mr-3' : '')} />
          {visualExpanded && 'Log out'}
        </button>
      </div>
    </aside>
  );
}
