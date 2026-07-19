'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAVIGATION_ITEMS, NavItem } from '@/config/navigation';
import { Printer, Plus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { MODULE_ROUTES } from '@/types/auth';
import { hasAnyRole, StaffRole } from '@/types/roles';
import { ROLE_META } from '@/types/roles';

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
  const searchParams = useSearchParams();
  const { profile, roles: liveRoles, isAdmin } = useAuth();

  // Impersonation: when admin previews a customer role
  const { effectiveRole } = useEffectiveUser(profile?.uid, profile?.role);

  const currentSearch = searchParams.toString();
  const fullPath = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const designerView = pathname.startsWith('/designer') ? searchParams.get('view') : null;

  const workspaceParam = searchParams.get('workspace');
  let activeModule = ['/manager', '/designer', '/printer', '/pasting', '/finishing', '/dispatch', '/accountant', '/support', '/acdema'].find(p => pathname.startsWith(p));
  
  if ((pathname.startsWith('/admin') || pathname.startsWith('/settings')) && workspaceParam) {
    activeModule = `/${workspaceParam}`;
  }

  const primaryRole = profile?.role && profile.role !== 'CUSTOMER' ? profile.role as StaffRole : null;
  const lockedModule = activeModule || (primaryRole ? (primaryRole === 'ADMIN' || primaryRole === 'SUPER_ADMIN' ? '/admin' : `/${primaryRole.toLowerCase()}`) : null);
  const sharedWorkspaceLinks = new Set(['/admin/orders', '/settings']);
  const originalDashboardRoute = profile?.role && profile.role !== 'CUSTOMER'
    ? MODULE_ROUTES[profile.role as StaffRole]
    : null;
  const originalDashboardLabel = profile?.role && profile.role !== 'CUSTOMER'
    ? ROLE_META[profile.role as StaffRole]?.label ?? profile.role
    : null;
  const allowSharedLinks = lockedModule !== '/acdema';
  const showRoleReset = Boolean(activeModule && originalDashboardRoute && originalDashboardRoute !== activeModule);

  const filteredItems = NAVIGATION_ITEMS.filter(item => {
    // Customer-mode or impersonating-customer: use single effectiveRole
    if (profile?.role === 'CUSTOMER' || effectiveRole === 'CUSTOMER') {
      return item.roles.includes('CUSTOMER');
    }
    
    // If in a specific module (or locked primary role on shared pages), show that module's links
    // plus any other modules the current staff member is assigned to.
    if (lockedModule) {
      const moduleRoleMap: Record<string, StaffRole> = {
        '/admin': 'ADMIN',
        '/manager': 'MANAGER',
        '/designer': 'DESIGNER',
        '/printer': 'PRINTER',
        '/pasting': 'PASTING',
        '/finishing': 'FINISHING',
        '/dispatch': 'DISPATCH',
        '/delivery': 'DELIVERY',
        '/accountant': 'ACCOUNTANT',
        '/support': 'SUPPORT',
        '/acdema': 'ACDEMA'
      };

      const targetRole = moduleRoleMap[lockedModule];
      if (allowSharedLinks && sharedWorkspaceLinks.has(item.href)) return true;

      const effectiveItemRoles = [...item.roles];
      if (
        effectiveItemRoles.includes('ACCOUNTANT') ||
        effectiveItemRoles.includes('MANAGER') ||
        effectiveItemRoles.includes('DESIGNER')
      ) {
        if (!effectiveItemRoles.includes('ACDEMA')) {
          effectiveItemRoles.push('ACDEMA');
        }
      }

      if (lockedModule === '/designer') {
        if (item.href === '/designer') return true;
        if (item.href === '/designer?view=unassigned') return designerView === 'unassigned' || designerView === 'all';
        if (item.href === '/designer?view=assigned') return designerView === 'assigned' || designerView === 'all';
        if (item.href === '/designer?view=all') return designerView === 'all';
        if (item.href === '/manager/customers') return false;
        if (item.href === '/manager') return false;
        return effectiveItemRoles.includes(targetRole);
      }

      return effectiveItemRoles.includes(targetRole);
    }

    // Default: Multi-role: show item if user has ANY required role (STRICT CHECK)
    const effectiveItemRoles = [...item.roles];
    if (
      effectiveItemRoles.includes('ACCOUNTANT') ||
      effectiveItemRoles.includes('MANAGER') ||
      effectiveItemRoles.includes('DESIGNER')
    ) {
      if (!effectiveItemRoles.includes('ACDEMA')) {
        effectiveItemRoles.push('ACDEMA');
      }
    }
    return effectiveItemRoles.some(r => liveRoles.includes(r as StaffRole));
  }).filter((item, index, self) =>
    // Deduplicate by label + href
    index === self.findIndex(t => t.label === item.label && t.href === item.href)
  );

  const mainItemsRaw = filteredItems.filter(i => i.group === 'main');
  const globalOrdersIndex = mainItemsRaw.findIndex(i => i.label === 'Global Orders');
  const mainItems = [...mainItemsRaw];
  if (globalOrdersIndex > -1) {
    const [globalOrdersItem] = mainItems.splice(globalOrdersIndex, 1);
    mainItems.unshift(globalOrdersItem);
  }

  const accountItems = filteredItems.filter(i => i.group === 'account');
  const bottomItems  = filteredItems.filter(i => i.group === 'bottom');

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string, e: React.MouseEvent) => {
    e.preventDefault();
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    let finalHref = item.href;
    if (sharedWorkspaceLinks.has(item.href) && lockedModule && lockedModule !== '/admin' && lockedModule !== '/acdema') {
      finalHref = finalHref.includes('?') 
         ? `${finalHref}&workspace=${lockedModule.replace('/', '')}`
         : `${finalHref}?workspace=${lockedModule.replace('/', '')}`;
    }

    const isActive = item.href.includes('?')
      ? fullPath === item.href
      : pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href) && !item.href.includes('?'));

    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isOpen = openMenus[item.label];
    const isSubActive = hasSubItems && item.subItems!.some(sub => pathname.startsWith(sub.href));
    const visuallyActive = isActive || isSubActive;

    const content = (
      <>
        <span className={cn(
          'flex items-center justify-center w-6 h-6 flex-shrink-0 transition-all duration-200',
          visuallyActive ? 'text-[#174ea6]' : 'text-slate-500'
        )}>
          <item.icon size={20} className={visuallyActive ? 'text-[#174ea6]' : 'text-slate-500'} strokeWidth={2} />
        </span>
        {visualExpanded && <span className="tracking-tight flex-1">{item.label}</span>}
      </>
    );

    const className = cn(
      'sidebar-item flex items-center gap-4 py-2.5 transition-all duration-200 overflow-hidden whitespace-nowrap cursor-pointer w-full text-left',
      visualExpanded ? 'px-6 mr-4 rounded-r-full' : 'px-0 justify-center mx-2 rounded-full',
      visuallyActive
        ? 'selected font-semibold bg-[var(--google-selected)] text-[#174ea6]'
        : 'text-slate-600 hover:bg-[var(--google-hover)]'
    );

    if (hasSubItems) {
      return (
        <div className="w-full">
          <button
            onClick={(e) => toggleMenu(item.label, e)}
            title={!visualExpanded ? item.label : undefined}
            className={className}
          >
            {content}
          </button>
          {isOpen && visualExpanded && (
            <div className="flex flex-col mt-1 mb-2">
              {item.subItems!.map(sub => {
                const isThisSubActive = pathname === sub.href;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={cn(
                      "py-2 pl-[52px] pr-4 text-sm whitespace-nowrap transition-colors rounded-r-full mr-4",
                      isThisSubActive 
                        ? "text-[#174ea6] font-semibold bg-[var(--google-selected)]/50" 
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    )}
                  >
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={finalHref}
        title={!visualExpanded ? item.label : undefined}
        className={className}
      >
        {content}
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
          href="/proxy-order"
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

      {showRoleReset && originalDashboardRoute && (
        <div className={cn('pb-4 flex-shrink-0', visualExpanded ? 'px-3' : 'px-2')}>
          <Link
            href={originalDashboardRoute}
            title={!visualExpanded ? `Back to ${originalDashboardLabel}` : undefined}
            className={cn(
              'flex items-center gap-2.5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.18em] transition-all overflow-hidden whitespace-nowrap border',
              'bg-white text-slate-600 border-slate-200 hover:border-blue-200 hover:text-blue-700 hover:bg-blue-50 shadow-sm',
              visualExpanded ? 'px-5 justify-start ml-2 mr-3' : 'px-0 justify-center w-12 h-12 mx-auto'
            )}
          >
            <span className={cn(
              'flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0 transition-all duration-200',
              'bg-blue-50 text-blue-600'
            )}>
              <ArrowLeft size={14} strokeWidth={2.5} />
            </span>
            {visualExpanded && <span>Back to {originalDashboardLabel}</span>}
          </Link>
        </div>
      )}

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
              ? <p className="text-[11px] font-semibold tracking-wide text-slate-500 px-6 pb-2">ACCOUNT PAGES</p>
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
