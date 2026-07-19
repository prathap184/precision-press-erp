'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Printer, Users, Palette, Headphones, Truck, Calculator, ClipboardList, Scissors, CheckCircle2,
  ArrowRight, ShieldCheck
} from 'lucide-react';
import { StaffRole } from '@/types/roles';
import { MODULE_ROUTES } from '@/types/auth';

interface RoleCard {
  id: StaffRole;
  label: string;
  subtitle: string;
  icon: any;
  color: string;
  bg: string;
  iconBg: string;
  route: string;
}

export const ROLE_CARDS: RoleCard[] = [
  { 
    id: 'MANAGER', 
    label: 'Manager', 
    subtitle: 'Ops & Assignment', 
    icon: Users, 
    color: 'text-blue-600',
    bg: 'bg-blue-50/50',
    iconBg: 'bg-blue-500',
    route: MODULE_ROUTES.MANAGER
  },
  { 
    id: 'ACDEMA', 
    label: 'Acdema', 
    subtitle: 'Proxy Orders', 
    icon: ClipboardList, 
    color: 'text-teal-600',
    bg: 'bg-teal-50/50',
    iconBg: 'bg-teal-500',
    route: MODULE_ROUTES.ACDEMA
  },
  { 
    id: 'DESIGNER', 
    label: 'Designer', 
    subtitle: 'Artwork & Proofs', 
    icon: Palette, 
    color: 'text-purple-600',
    bg: 'bg-purple-50/50',
    iconBg: 'bg-purple-500',
    route: MODULE_ROUTES.DESIGNER
  },
  { 
    id: 'SUPPORT', 
    label: 'Support Team', 
    subtitle: 'Customer Ops', 
    icon: Headphones, 
    color: 'text-indigo-600',
    bg: 'bg-indigo-50/50',
    iconBg: 'bg-indigo-500',
    route: MODULE_ROUTES.SUPPORT
  },
  { 
    id: 'PRINTER', 
    label: 'Printer', 
    subtitle: 'Production Queue', 
    icon: Printer, 
    color: 'text-amber-600',
    bg: 'bg-amber-50/50',
    iconBg: 'bg-amber-500',
    route: MODULE_ROUTES.PRINTER
  },
  { 
    id: 'PASTING', 
    label: 'Pasting', 
    subtitle: 'Photo Upload & Work Done', 
    icon: Scissors, 
    color: 'text-teal-600',
    bg: 'bg-teal-50/50',
    iconBg: 'bg-teal-500',
    route: MODULE_ROUTES.PASTING
  },
  { 
    id: 'FINISHING', 
    label: 'Finishing', 
    subtitle: 'Photo Upload & Work Done', 
    icon: CheckCircle2, 
    color: 'text-blue-600',
    bg: 'bg-blue-50/50',
    iconBg: 'bg-blue-500',
    route: MODULE_ROUTES.FINISHING
  },
  { 
    id: 'DISPATCH', 
    label: 'Dispatch', 
    subtitle: 'Logistics & Handover', 
    icon: Truck, 
    color: 'text-teal-600',
    bg: 'bg-teal-50/50',
    iconBg: 'bg-teal-500',
    route: MODULE_ROUTES.DISPATCH
  },
  { 
    id: 'DELIVERY', 
    label: 'Delivery', 
    subtitle: 'Final Delivery', 
    icon: Truck, 
    color: 'text-cyan-600',
    bg: 'bg-cyan-50/50',
    iconBg: 'bg-cyan-500',
    route: '/delivarypartner'
  },
  { 
    id: 'ACCOUNTANT', 
    label: 'Accountant', 
    subtitle: 'Payments & Ledger', 
    icon: Calculator, 
    color: 'text-red-600',
    bg: 'bg-red-50/50',
    iconBg: 'bg-red-500',
    route: MODULE_ROUTES.ACCOUNTANT
  },
  { 
    id: 'ADMIN', 
    label: 'Admin Control', 
    subtitle: 'Staff & Settings', 
    icon: Users, 
    color: 'text-slate-900',
    bg: 'bg-slate-50/50',
    iconBg: 'bg-slate-900',
    route: '/admin'
  },
  { 
    id: 'SUPER_ADMIN', 
    label: 'System Config', 
    subtitle: 'Root Access', 
    icon: ShieldCheck, 
    color: 'text-indigo-900',
    bg: 'bg-indigo-50/50',
    iconBg: 'bg-indigo-950',
    route: '/admin/control'
  },
];

interface ControlCenterProps {
  allowedRoles: StaffRole[];
  title?: string;
  subtitle?: string;
  onRoleClick?: (role: StaffRole) => void;
  isImpersonation?: boolean;
}

export function ControlCenter({ 
  allowedRoles, 
  title = "Control Center", 
  subtitle = "Select an operational domain to begin.",
  onRoleClick,
  isImpersonation = false
}: ControlCenterProps) {
  
  const isAdmin = allowedRoles.some(r => ['ADMIN', 'SUPER_ADMIN'].includes(r));

  // Filter cards based on user's actual roles. Admins see everything.
  const filteredRoles = ROLE_CARDS.filter(role => 
    isAdmin || allowedRoles.includes(role.id)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] -z-10 opacity-40" />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">{title}</h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Role Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRoles.map((role) => {
          const CardContent = (
            <>
              <div className={`w-16 h-16 rounded-2xl ${role.iconBg} flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                <role.icon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2">{role.label}</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-tight">{role.subtitle}</p>
              
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            </>
          );

          if (onRoleClick) {
            return (
              <button
                key={role.id}
                onClick={() => onRoleClick(role.id)}
                className={`group relative flex flex-col items-center justify-center p-8 ${role.bg} border border-transparent hover:border-slate-200 rounded-[2rem] hover:bg-white hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-2 transition-all duration-500 text-center`}
              >
                {CardContent}
              </button>
            );
          }

          return (
            <Link
              key={role.id}
              href={role.route}
              className={`group relative flex flex-col items-center justify-center p-8 ${role.bg} border border-transparent hover:border-slate-200 rounded-[2rem] hover:bg-white hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-2 transition-all duration-500 text-center`}
            >
              {CardContent}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      {filteredRoles.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-slate-400 font-bold uppercase tracking-widest">No assigned dashboards found.</p>
        </div>
      )}
    </div>
  );
}
