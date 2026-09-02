'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ROLE_CARDS } from './ControlCenter';
import { StaffRole } from '@/types/roles';
import { LayoutGrid } from 'lucide-react';

interface StaffRoleSwitcherProps {
  userRoles?: StaffRole[];
}

export function StaffRoleSwitcher({ userRoles: propRoles }: StaffRoleSwitcherProps) {
  const { profile, switchActiveRole } = useAuth();
  const pathname = usePathname();

  // Combine original profile role with assigned roles
  const profileRolesSet = new Set<StaffRole>();
  if (profile?.role && profile.role !== 'CUSTOMER') profileRolesSet.add(profile.role as StaffRole);
  if (Array.isArray(profile?.roles)) profile.roles.forEach(r => profileRolesSet.add(r));
  
  const userRoles = propRoles || Array.from(profileRolesSet);

  // Filter cards to only those the user actually has
  const availableCards = ROLE_CARDS.filter(card => userRoles.includes(card.id));
  const commandCenterHref = userRoles.length === 1
    ? ROLE_CARDS.find(card => card.id === userRoles[0])?.route ?? '/staff'
    : '/staff';

  // If user only has one role, maybe don't show the switcher? 
  // No, let's show "Back to Hub" at least.
  
  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link 
            href={commandCenterHref}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all shadow-sm"
          >
            <LayoutGrid size={14} />
            Command Center
          </Link>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Quick Role Switcher</p>
        </div>

        <div className="hidden md:flex items-center gap-1.5 p-1 bg-slate-100/50 border border-slate-200 rounded-xl backdrop-blur-sm">
          {availableCards.map(role => {
            const isActive = pathname === role.route;
            return (
              <Link
                key={role.id}
                href={role.route}
                onClick={() => {
                  if (profile?.role !== 'ADMIN' && profile?.role !== 'SUPER_ADMIN') {
                    switchActiveRole?.(role.id);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                    : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {role.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
