'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAVIGATION_ITEMS, NavItem } from '@/config/navigation';
import { Printer, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const Sidebar = ({ isExpanded = false, onToggle }: SidebarProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const visualExpanded = isExpanded || isHovered;

  const pathname = usePathname();
  const { profile } = useAuth();

  const mainItems = NAVIGATION_ITEMS.filter(i => i.group === 'main');
  const accountItems = NAVIGATION_ITEMS.filter(i => i.group === 'account');
  const bottomItems = NAVIGATION_ITEMS.filter(i => i.group === 'bottom');

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href) && !item.href.includes('?'));

    return (
      <Link
        key={item.href}
        href={item.href}
        title={!visualExpanded ? item.label : undefined}
        className={cn(
          'sidebar-item flex items-center gap-4 py-2.5 transition-all duration-200 overflow-hidden whitespace-nowrap',
          visualExpanded ? 'px-6 mr-4 rounded-r-full' : 'px-0 justify-center mx-2 rounded-full',
          isActive
            ? 'selected font-semibold bg-[var(--google-selected)] text-[#174ea6]'
            : 'text-slate-600 hover:bg-[var(--google-hover)]'
        )}
      >
        <span className={cn(
          'flex items-center justify-center w-6 h-6 flex-shrink-0 transition-all duration-200',
          isActive ? 'text-[#174ea6]' : 'text-slate-500'
        )}>
          <item.icon size={20} className={isActive ? 'text-[#174ea6]' : 'text-slate-500'} strokeWidth={2} />
        </span>
        {visualExpanded && <span className="tracking-tight">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'sidebar flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 overflow-hidden',
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
      </div>

      {/* NEW PRINT JOB CTA */}
      <div className={cn('pt-2 pb-4 flex-shrink-0', visualExpanded ? 'px-3' : 'px-2')}>
        <Link
          href={'/categories'}
          title={!visualExpanded ? 'New Print Job' : undefined}
          className={cn(
            'flex items-center gap-3 py-3 rounded-2xl font-medium text-sm transition-all overflow-hidden whitespace-nowrap',
            'bg-[#c2e7ff] text-[#001d35] hover:bg-[#b5dfff] hover:shadow-md',
            visualExpanded ? 'px-5 justify-start ml-2 mr-3' : 'px-0 justify-center w-12 h-12 mx-auto'
          )}
        >
          <Plus size={20} strokeWidth={2.5} className="flex-shrink-0" />
          {visualExpanded && <span>New Print Job</span>}
        </Link>
      </div>

      {/* SCROLLABLE NAV */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-2">

        {mainItems.length > 0 && (
          <div className="pb-2">
            {visualExpanded && (
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 px-6 pb-2 pt-2">PAGES</p>
            )}
            <div className="space-y-0.5">
              {mainItems.map(item => <NavLink key={item.href} item={item} />)}
            </div>
          </div>
        )}

        {accountItems.length > 0 && (
          <div className="pt-2 pb-2">
            {visualExpanded
              ? <p className="text-[11px] font-semibold tracking-wide text-slate-500 px-6 pb-2">ACCOUNT</p>
              : <div className="border-t border-slate-200 my-2 mx-3" />
            }
            <div className="space-y-0.5">
              {accountItems.map(item => <NavLink key={item.href} item={item} />)}
            </div>
          </div>
        )}

        {bottomItems.length > 0 && (
          <div className="pt-2">
            <div className="space-y-0.5">
              {bottomItems.map(item => <NavLink key={item.href} item={item} />)}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
