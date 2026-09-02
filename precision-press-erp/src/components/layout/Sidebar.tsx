'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { NAVIGATION_ITEMS, NavItem, getRoleGlobalOrdersUrl } from '@/config/navigation';
import { Printer, Plus, ArrowLeft, LayoutDashboard, Users, TrendingUp, ShoppingCart, BookOpen, Receipt, FolderKanban, UserRound, Package, Wallet, Layers, Building2, FileText, BarChart3, ChevronLeft, Settings, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
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

// ─────────────────────────────────────────────
// DUBBL ACCOUNTING SIDEBAR
// Shows when on /accounting/* routes
// ─────────────────────────────────────────────
const DUBBL_NAV = [
  {
    section: null,
    items: [
      { label: 'Dashboard',   href: '/accounting',          icon: LayoutDashboard },
      { label: 'Banking',     href: '/accounting/banking',  icon: Wallet },
      { label: 'Contacts',    href: '/accounting/contacts', icon: Users },
    ],
  },
  {
    section: 'FINANCIALS',
    items: [
      { label: 'Sales',            href: '/accounting/sales',                      icon: TrendingUp },
      { label: 'Purchases',        href: '/accounting/purchases',                  icon: ShoppingCart },
      { label: 'Accounting',       href: '/accounting/accounts',                   icon: BookOpen },
      { label: 'Journal Registry', href: '/accounting/journal/registry',           icon: FileText },
      { label: 'Contra Registry',  href: '/accounting/contra/registry',            icon: FileText },
      { label: 'Receipt Registry', href: '/accounting/sales/customer-prepayments', icon: Wallet },
      { label: 'Payment Registry', href: '/accounting/payment/registry',           icon: ArrowUpRight },
      { label: 'Tax',              href: '/accounting/tax',                        icon: Receipt },
    ],
  },
  {
    section: 'OPERATIONS',
    items: [
      { label: 'Projects',     href: '/accounting/projects',    icon: FolderKanban },
      { label: 'Teams',        href: '/accounting/teams',       icon: UserRound },
      { label: 'Inventory',    href: '/accounting/inventory',   icon: Package },
      { label: 'Payroll',      href: '/accounting/payroll',     icon: Wallet },
      { label: 'CRM',          href: '/accounting/crm',         icon: Building2 },
      { label: 'Documents',    href: '/accounting/documents',   icon: FileText },
      { label: 'Pixel Orders', href: '/admin/orders',           icon: Layers },
    ],
  },
  {
    section: 'REPORTING & SETTINGS',
    items: [
      { label: 'Reports',      href: '/accounting/reports',     icon: BarChart3 },
      { label: 'Budgets',      href: '/accounting/budgets',     icon: BarChart3 },
      { label: 'Fixed Assets', href: '/accounting/fixed-assets', icon: Building2 },
      { label: 'Loans',        href: '/accounting/loans',       icon: Layers },
      { label: 'Settings',     href: '/accounting/settings',    icon: Settings },
    ],
  },
];

function AccountingSidebar({ isExpanded, isHovered }: { isExpanded: boolean; isHovered: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const workspaceParam = searchParams.get('workspace');
  const visualExpanded = isExpanded || isHovered;

  const globalOrdersHref = getRoleGlobalOrdersUrl(profile?.role, workspaceParam);

  // G key → Global Orders for respective role
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        router.push(globalOrdersHref);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, globalOrdersHref]);

  return (
    <aside
      className={cn(
        'sidebar flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 overflow-hidden',
        'bg-white/30 backdrop-blur-2xl border-r border-white/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]',
        visualExpanded ? 'w-[280px]' : 'w-[72px]'
      )}
    >
      {/* HEADER — logo + back button */}
      <div className={cn(
        'flex items-center flex-shrink-0',
        visualExpanded ? 'justify-between px-5 py-4 gap-3' : 'justify-center py-4'
      )}>
        {visualExpanded ? (
          <Link href="/admin/orders" className="flex items-center gap-3 overflow-hidden min-w-0 hover:opacity-85 transition-opacity">
            <img src="/logo.png" alt="Pixel Marketing Logo" className="w-10 h-10 rounded-xl object-contain shadow-sm border border-white/60 flex-shrink-0 bg-white/60 backdrop-blur-md" />
            <div className="overflow-hidden flex flex-col justify-center">
              <h1 className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 font-black text-xs tracking-wider uppercase truncate leading-tight whitespace-nowrap">Pixel Marketing</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Accounting MES</p>
            </div>
          </Link>
        ) : (
          <Link href="/admin/orders" className="w-10 h-10 rounded-xl bg-white/50 border border-white/60 shadow-sm flex items-center justify-center p-1.5 hover:scale-105 transition-transform backdrop-blur-md">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </Link>
        )}
      </div>

      {/* BACK TO ERP BUTTON */}
      <div className={cn('pb-3 flex-shrink-0', visualExpanded ? 'px-3' : 'px-2')}>
        <Link
          href={globalOrdersHref}
          title={!visualExpanded ? 'Back to Global Orders (G)' : undefined}
          className={cn(
            'flex items-center gap-2.5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] transition-all overflow-hidden whitespace-nowrap border group relative',
            'bg-white/40 text-slate-600 border-white/50 hover:border-white/80 hover:text-blue-700 hover:bg-white/60 shadow-sm backdrop-blur-md',
            visualExpanded ? 'px-4 justify-start' : 'px-0 justify-center w-11 h-11 mx-auto'
          )}
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-xl flex-shrink-0 bg-blue-50/80 text-blue-600">
            <ChevronLeft size={14} strokeWidth={2.5} />
          </span>
          {visualExpanded && (
            <span className="flex items-center justify-between flex-1">
              <span>Global Orders</span>
              <kbd className="px-1.5 py-0.5 text-[8px] bg-white/60 border border-white/60 rounded font-mono text-slate-500 font-bold">G</kbd>
            </span>
          )}
          {!visualExpanded && (
            <div className="absolute left-[54px] px-2.5 py-1 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold rounded-xl shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 translate-x-1 group-hover:translate-x-0">
              Global Orders (G)
            </div>
          )}
        </Link>
      </div>

      {/* SCROLLABLE NAV */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-1 space-y-3">
        {DUBBL_NAV.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.section && visualExpanded && (
              <p className="text-[9px] font-black tracking-[0.2em] text-slate-400 uppercase px-5 pt-2 pb-0.5">{group.section}</p>
            )}
            {group.section && !visualExpanded && gi > 0 && (
              <div className="border-t border-white/40 my-1 mx-3" />
            )}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const isActive = pathname === item.href || (item.href !== '/admin/orders' && item.href !== '/accounting' && pathname.startsWith(item.href)) || (item.href === '/accounting' && pathname === '/accounting');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group relative flex items-center transition-all duration-200 overflow-hidden whitespace-nowrap cursor-pointer text-left',
                      visualExpanded 
                        ? 'mx-2.5 px-3.5 py-2.5 rounded-2xl gap-3 text-[16px]' 
                        : 'w-11 h-11 mx-auto rounded-2xl justify-center',
                      isActive
                        ? visualExpanded 
                          ? 'bg-white/60 text-blue-700 font-bold border border-white/70 shadow-sm backdrop-blur-md'
                          : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-white/50'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/40 font-semibold'
                    )}
                  >
                    <span className={cn(
                      'flex items-center justify-center flex-shrink-0 transition-colors',
                      visualExpanded 
                        ? (isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700')
                        : (isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700')
                    )}>
                      <item.icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                    </span>
                    {visualExpanded && <span className="tracking-tight flex-1 truncate font-semibold text-[16px]">{item.label}</span>}
                    
                    {/* Tooltip on collapsed */}
                    {!visualExpanded && (
                      <div className="absolute left-[54px] px-2.5 py-1 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold rounded-xl shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 translate-x-1 group-hover:translate-x-0">
                        {item.label}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

interface SidebarProps {
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const Sidebar = ({ isExpanded = false, onToggle }: SidebarProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const visualExpanded = isExpanded || isHovered;

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, roles: liveRoles, isAdmin } = useAuth();

  // Impersonation: when admin previews a customer role
  const { effectiveRole } = useEffectiveUser(profile?.uid, profile?.role);

  const currentSearch = searchParams.toString();
  const fullPath = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const designerView = pathname.startsWith('/designer') ? searchParams.get('view') : null;

  const workspaceParam = searchParams.get('workspace');
  let activeModule = ['/manager', '/designer', '/printer', '/pasting', '/finishing', '/dispatch', '/accountant', '/support', '/acdema'].find(p => pathname.startsWith(p));
  
  if (workspaceParam) {
    activeModule = `/${workspaceParam}`;
  }

  const primaryRole = profile?.role && profile.role !== 'CUSTOMER' ? profile.role as StaffRole : null;
  const isRealAdmin = primaryRole === 'ADMIN' || primaryRole === 'SUPER_ADMIN' || profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN' || liveRoles.includes('ADMIN') || liveRoles.includes('SUPER_ADMIN');
  const isAdminUser = isRealAdmin;

  // If visiting another role module (e.g. /printer, /manager), show that role's actual dashboard items
  const lockedModule = activeModule || (isAdminUser ? '/admin' : (primaryRole ? `/${primaryRole.toLowerCase()}` : null));

  // Global G shortcut: press 'g' or 'G' to go to role's respective global orders page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        const targetUrl = getRoleGlobalOrdersUrl(lockedModule || primaryRole, workspaceParam);
        router.push(targetUrl);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, lockedModule, primaryRole, workspaceParam]);

  const sharedWorkspaceLinks = new Set(['/settings']);
  const originalDashboardRoute = isAdminUser
    ? '/admin/orders'
    : (primaryRole ? (MODULE_ROUTES[primaryRole] || '/staff') : null);

  const originalDashboardLabel = isAdminUser
    ? 'Admin'
    : (primaryRole ? (ROLE_META[primaryRole]?.label ?? primaryRole) : null);

  const allowSharedLinks = lockedModule !== '/acdema';
  const isViewingHome = isAdminUser
    ? (pathname.startsWith('/admin') && !workspaceParam)
    : (originalDashboardRoute && pathname.startsWith(originalDashboardRoute));

  const showRoleReset = Boolean(!isViewingHome && originalDashboardRoute && originalDashboardRoute !== activeModule);

  const filteredItems = NAVIGATION_ITEMS.filter(item => {
    // Customer-mode or impersonating-customer: use single effectiveRole
    if (profile?.role === 'CUSTOMER' || effectiveRole === 'CUSTOMER') {
      return item.roles.includes('CUSTOMER');
    }
    
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

    const effectiveItemRoles = [...item.roles];
    return effectiveItemRoles.some(r => liveRoles.includes(r as StaffRole));
  }).filter((item, index, self) => {
    const isFirstSameHref = index === self.findIndex(t => t.label === item.label && t.href === item.href);
    if (!isFirstSameHref) return false;
    // Strict Global Orders deduplication: ensure only ONE Global Orders link appears in the sidebar!
    if (item.label.includes('Global Orders')) {
      const firstGlobalIndex = self.findIndex(t => t.label.includes('Global Orders'));
      return index === firstGlobalIndex;
    }
    return true;
  });

  const mainItems = filteredItems.filter(i => i.group === 'main');

  const accountItems = filteredItems.filter(i => i.group === 'account');
  const bottomItems  = filteredItems.filter(i => i.group === 'bottom');

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string, e: React.MouseEvent) => {
    e.preventDefault();
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const renderNavLink = (item: NavItem) => {
    let finalHref = item.href;
    if (item.href !== '/staff' && lockedModule) {
      const paramName = lockedModule.replace('/', '');
      if (!finalHref.includes('workspace=')) {
        finalHref = finalHref.includes('?') 
           ? `${finalHref}&workspace=${paramName}`
           : `${finalHref}?workspace=${paramName}`;
      }
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
          'flex items-center justify-center flex-shrink-0 transition-all duration-200',
          visualExpanded 
            ? (visuallyActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700')
            : (visuallyActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700')
        )}>
          <item.icon size={20} strokeWidth={visuallyActive ? 2.2 : 1.8} />
        </span>
        {visualExpanded && <span className="tracking-tight flex-1 truncate font-semibold text-[16px]">{item.label}</span>}
        {!visualExpanded && (
          <div className="absolute left-[54px] px-2.5 py-1 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold rounded-xl shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 translate-x-1 group-hover:translate-x-0">
            {item.label}
          </div>
        )}
      </>
    );

    const className = cn(
      'group relative flex items-center transition-all duration-200 overflow-hidden whitespace-nowrap cursor-pointer text-left',
      visualExpanded 
        ? 'mx-2.5 px-3.5 py-2.5 rounded-2xl gap-3 text-[16px]' 
        : 'w-11 h-11 mx-auto rounded-2xl justify-center',
      visuallyActive
        ? visualExpanded 
          ? 'bg-white/60 text-blue-700 font-bold border border-white/70 shadow-sm backdrop-blur-md'
          : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-white/50'
        : 'text-slate-600 hover:text-slate-900 hover:bg-white/40 font-semibold'
    );

    if (hasSubItems) {
      return (
        <div key={item.href} className="w-full">
          <button
            onClick={(e) => toggleMenu(item.label, e)}
            className={className}
          >
            {content}
          </button>
          {isOpen && visualExpanded && (
            <div className="flex flex-col mt-1 mb-2 pl-9 space-y-1">
              {item.subItems!.map(sub => {
                const isThisSubActive = pathname === sub.href;
                
                let subHref = sub.href;
                if (sub.href !== '/staff' && lockedModule) {
                  const paramName = lockedModule.replace('/', '');
                  if (!subHref.includes('workspace=')) {
                    subHref = subHref.includes('?') 
                       ? `${subHref}&workspace=${paramName}`
                       : `${subHref}?workspace=${paramName}`;
                  }
                }

                return (
                  <Link
                    key={sub.href}
                    href={subHref}
                    scroll={false}
                    className={cn(
                      "py-2 px-3 text-[14px] whitespace-nowrap transition-colors rounded-xl font-semibold flex items-center gap-2.5",
                      isThisSubActive 
                        ? "text-blue-700 font-bold bg-white/60 border border-white/60 backdrop-blur-md shadow-sm" 
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", isThisSubActive ? "bg-blue-600" : "bg-slate-400/80")} />
                    <span>{sub.label}</span>
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
        scroll={false}
        className={className}
      >
        {content}
      </Link>
    );
  };

  // Show Dubbl accounting sidebar on /accounting/* pages
  if (pathname.startsWith('/accounting')) {
    return (
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          'sidebar flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 overflow-hidden',
          'bg-white/30 backdrop-blur-2xl border-r border-white/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]',
          visualExpanded ? 'w-[280px]' : 'w-[72px]'
        )}
      >
        <AccountingSidebar isExpanded={isExpanded} isHovered={isHovered} />
      </aside>
    );
  }

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'sidebar flex flex-col h-screen fixed left-0 top-0 z-50 transition-all duration-300 overflow-hidden',
        'bg-white/30 backdrop-blur-2xl border-r border-white/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)]',
        visualExpanded ? 'w-[280px]' : 'w-[72px]'
      )}
    >
      {/* HEADER */}
      <div className={cn(
        'flex items-center flex-shrink-0',
        visualExpanded ? 'justify-between px-5 py-4 gap-3' : 'justify-center py-4'
      )}>
        {visualExpanded ? (
          <Link href="/admin/orders" className="flex items-center gap-3 overflow-hidden min-w-0 hover:opacity-85 transition-opacity">
            <img 
              src="/logo.png" 
              alt="Pixel Marketing Logo" 
              className="w-10 h-10 rounded-xl object-contain shadow-sm border border-white/60 flex-shrink-0 bg-white/60 backdrop-blur-md"
            />
            <div className="overflow-hidden flex flex-col justify-center">
              <h1 className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 font-black text-xs tracking-wider uppercase truncate leading-tight whitespace-nowrap">Pixel Marketing</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Enterprise MES</p>
            </div>
          </Link>
        ) : (
          <Link href="/admin/orders" className="w-10 h-10 rounded-xl bg-white/50 border border-white/60 shadow-sm flex items-center justify-center p-1.5 hover:scale-105 transition-transform backdrop-blur-md">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </Link>
        )}
      </div>

      {/* NEW PRINT JOB CTA */}
      <div className={cn('pb-3 flex-shrink-0', visualExpanded ? 'px-3' : 'px-2')}>
        <Link
          href="/proxy-order"
          className={cn(
            'flex items-center font-black text-[14px] uppercase tracking-wider transition-all overflow-hidden whitespace-nowrap group relative',
            'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-95',
            visualExpanded ? 'px-4 py-3 rounded-2xl gap-3 justify-start' : 'px-0 justify-center w-11 h-11 rounded-2xl mx-auto'
          )}
        >
          <Plus size={19} strokeWidth={3} className="flex-shrink-0" />
          {visualExpanded && <span>(N) New Print Job</span>}
          {!visualExpanded && (
            <div className="absolute left-[54px] px-2.5 py-1 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold rounded-xl shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 translate-x-1 group-hover:translate-x-0">
              (N) New Print Job
            </div>
          )}
        </Link>
      </div>

      {showRoleReset && originalDashboardRoute && (
        <div className={cn('pb-3 flex-shrink-0', visualExpanded ? 'px-3' : 'px-2')}>
          <Link
            href={originalDashboardRoute}
            className={cn(
              'flex items-center py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] transition-all overflow-hidden whitespace-nowrap border group relative',
              'bg-white/40 text-slate-600 border-white/50 hover:border-white/80 hover:text-blue-700 hover:bg-white/60 shadow-sm backdrop-blur-md',
              visualExpanded ? 'px-4 gap-2.5 justify-start' : 'px-0 justify-center w-11 h-11 rounded-2xl mx-auto'
            )}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-xl flex-shrink-0 bg-blue-50/80 text-blue-600">
              <ArrowLeft size={14} strokeWidth={2.5} />
            </span>
            {visualExpanded && <span>Back to {originalDashboardLabel}</span>}
            {!visualExpanded && (
              <div className="absolute left-[54px] px-2.5 py-1 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-bold rounded-xl shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 translate-x-1 group-hover:translate-x-0">
                Back to {originalDashboardLabel}
              </div>
            )}
          </Link>
        </div>
      )}

      {/* SCROLLABLE NAV */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-1 space-y-3">
        {mainItems.length > 0 && (
          <div className="space-y-1">
            {visualExpanded && (
              <p className="text-[9px] font-black tracking-[0.2em] text-slate-400 uppercase px-5 pt-1 pb-0.5">PAGES</p>
            )}
            <div className="space-y-0.5">
              {mainItems.map(item => renderNavLink(item))}
            </div>
          </div>
        )}

        {accountItems.length > 0 && (
          <div className="space-y-1">
            {visualExpanded ? (
              <p className="text-[9px] font-black tracking-[0.2em] text-slate-400 uppercase px-5 pt-2 pb-0.5">ACCOUNT PAGES</p>
            ) : (
              <div className="border-t border-white/40 my-1 mx-3" />
            )}
            <div className="space-y-0.5">
              {accountItems.map(item => renderNavLink(item))}
            </div>
          </div>
        )}

        {bottomItems.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="space-y-0.5">
              {bottomItems.map(item => renderNavLink(item))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
