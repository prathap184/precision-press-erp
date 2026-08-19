'use client';

import React from 'react';
import { OrderWorkflowSnapshot, OrderWorkflowStep } from '@/types/workflow';
import { Check, Play, AlertCircle, Clock, Lock, ChevronRight, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { StaffRole } from '@/types/roles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface WorkflowPipelineVisualProps {
  snapshot?: OrderWorkflowSnapshot | null;
  orderId?: string;
  className?: string;
  detailed?: boolean;
  filterByRoles?: boolean;
  allowNavigation?: boolean;
}

const ROLE_DASHBOARD_URL: Partial<Record<StaffRole, string>> = {
  ACCOUNTANT: '/accountant',
  DESIGNER: '/designer',
  MANAGER: '/manager',
  PRINTER: '/printer',
  PASTING: '/pasting',
  FINISHING: '/finishing',
  DISPATCH: '/dispatch',
  DELIVERY: '/delivarypartner/orders',
};

export function WorkflowPipelineVisual({
  snapshot,
  orderId,
  className = '',
  detailed = false,
  filterByRoles = false,
  allowNavigation = false,
}: WorkflowPipelineVisualProps): JSX.Element {
  let roles: StaffRole[] = [];
  let role: string | undefined;
  const pathname = usePathname();

  try {
    const auth = useAuth();
    roles = auth.roles || [];
    role = auth.role || undefined;
  } catch {
    // fallback if outside AuthProvider
  }

  const defaultAcdemaRoles: StaffRole[] = ['ACCOUNTANT', 'DESIGNER', 'MANAGER'];
  const effectiveRolesSet = new Set<StaffRole>(roles);
  if (roles.includes('ACDEMA' as StaffRole)) {
    defaultAcdemaRoles.forEach((r) => effectiveRolesSet.add(r));
  }
  const effectiveRoles = Array.from(effectiveRolesSet);

  if (!snapshot || !snapshot.steps || snapshot.steps.length === 0) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-[9px] font-bold text-slate-400 italic">No Pipeline</span>
      </div>
    );
  }

  const isAdmin =
    roles.includes('ADMIN' as StaffRole) ||
    roles.includes('SUPER_ADMIN' as StaffRole) ||
    role === 'ADMIN' ||
    role === 'SUPER_ADMIN';

  let stepsToRender = snapshot.steps.map((step, index) => ({
    ...step,
    originalIndex: index,
    isCurrent: index === snapshot.currentStepIndex,
    isCompleted: index < snapshot.currentStepIndex,
  }));

  if (filterByRoles && !isAdmin) {
    stepsToRender = stepsToRender.filter((step) => effectiveRoles.includes(step.role));
  }

  if (stepsToRender.length === 0) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-[9px] font-bold text-slate-400 italic">No Stages for Assigned Roles</span>
      </div>
    );
  }

  const canNavigateToStage = (step: typeof stepsToRender[0]): boolean => {
    if (step.isCurrent) {
      return isAdmin || effectiveRoles.includes(step.role);
    }
    if (step.isCompleted) {
      return isAdmin;
    }
    return false;
  };

  const getNavHref = (step: typeof stepsToRender[0]): string | null => {
    if (!allowNavigation || !orderId) return null;
    if (!canNavigateToStage(step)) return null;

    const basePath = step.role === 'ACCOUNTANT' ? '/accountant/payments' : ROLE_DASHBOARD_URL[step.role];
    if (!basePath) return null;

    const returnParam = pathname ? `?returnTo=${encodeURIComponent(`${pathname}?highlight=${orderId}`)}` : '';

    if (step.role === 'DESIGNER') {
      return `/designer/orders/${orderId}${returnParam}`;
    }

    if (step.role === 'MANAGER') {
      return `/manager/orders/${orderId}${returnParam}`;
    }

    if (step.role === 'DISPATCH') {
      return `/dispatch/orders/${orderId}${returnParam}`;
    }

    if (step.role === 'DELIVERY') {
      return `/delivarypartner/orders/${orderId}${returnParam}`;
    }

    if (step.role === 'PRINTER') {
      const pPath = pathname.startsWith('/printer')
        ? `/printer/orders/${orderId}`
        : `/admin/orders/${orderId}`;
      return `${pPath}${returnParam}`;
    }

    if (step.role === 'PASTING') {
      return `/pasting/orders/${orderId}${returnParam}`;
    }

    if (step.role === 'FINISHING') {
      return `/finishing/orders/${orderId}${returnParam}`;
    }

    const returnParamWithAmp = pathname ? `&returnTo=${encodeURIComponent(`${pathname}?highlight=${orderId}`)}` : '';
    return `${basePath}?orderId=${orderId}${returnParamWithAmp}`;
  };

  if (detailed) {
    return (
      <div className={`flex flex-nowrap items-center gap-x-0.5 pb-1 ${className}`}>
        {stepsToRender.map((step, index) => {
          const isCurrent = step.isCurrent;
          const isCompleted = step.isCompleted;
          const navHref = getNavHref(step);

          let bgClass = 'bg-slate-100/90 text-slate-500 border-slate-200 shadow-2xs';
          let icon = <Lock size={13} className="text-slate-400 shrink-0" />;

          if (isCompleted) {
            bgClass = 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-2xs';
            icon = <Check size={12} className="text-emerald-600 shrink-0 stroke-[3]" />;
          } else if (isCurrent) {
            if (step.status === 'IN_PROGRESS') {
              bgClass = 'bg-blue-100 text-blue-900 border-blue-400 ring-1 ring-blue-200 ring-offset-0 animate-pulse shadow-2xs';
              icon = <Play size={12} className="text-blue-700 fill-blue-700 shrink-0" />;
            } else if (step.status === 'ON_HOLD' || step.status === 'PAUSED') {
              bgClass = 'bg-amber-100 text-amber-900 border-amber-400 ring-1 ring-amber-200 ring-offset-0 shadow-2xs';
              icon = <AlertCircle size={12} className="text-amber-700 shrink-0" />;
            } else {
              bgClass = 'bg-sky-100 text-sky-900 border-sky-400 ring-1 ring-sky-200 ring-offset-0 shadow-2xs';
              icon = <Clock size={12} className="text-sky-700 shrink-0" />;
            }
          }

const SHORT_STEP_LABELS: Record<string, string> = {
  'Accounts Approval': 'Accounts',
  'Design & Artwork': 'Design',
  'Manager Sign-Off': 'Manager',
  'Printing': 'Print',
  'Pasting': 'Pasting',
  'Finishing': 'Finishing',
  'Dispatch': 'Dispatch',
  'Delivery': 'Delivery',
  'ACCOUNTANT': 'Accounts',
  'DESIGNER': 'Design',
  'MANAGER': 'Manager',
  'PRINTER': 'Print',
  'PASTING': 'Pasting',
  'FINISHING': 'Finishing',
  'DISPATCH': 'Dispatch',
  'DELIVERY': 'Delivery',
};

          const displayLabel = SHORT_STEP_LABELS[step.label] || SHORT_STEP_LABELS[step.role] || step.label;
          const pillContent = (
            <>
              {icon}
              <span className="font-bold text-slate-800 whitespace-nowrap text-[14px]">{displayLabel}</span>
              {navHref && <ExternalLink size={10} className="shrink-0 opacity-60 ml-0.5" />}
            </>
          );

          const pillBase = `w-[100px] h-[27px] flex items-center justify-center gap-1.5 px-2 rounded-md border text-[14px] font-bold tracking-normal transition-all duration-200 select-none shadow-sm ${bgClass}`;

          return (
            <div key={`${step.role}-${index}`} className="flex items-center shrink-0">
              {navHref ? (
                <Link
                  href={navHref}
                  className={`${pillBase} hover:brightness-95 hover:scale-105 cursor-pointer`}
                  title={`Open ${step.label} (${step.role})`}
                >
                  {pillContent}
                </Link>
              ) : (
                <div className={pillBase} title={`${step.label} (${step.role}): ${step.status.replace(/_/g, ' ')}`}>
                  {pillContent}
                </div>
              )}

              {index < stepsToRender.length - 1 && (
                <ChevronRight
                  size={10}
                  className={`mx-0.5 shrink-0 ${isCompleted ? 'text-emerald-500' : 'text-slate-400'}`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const getStepColor = (step: OrderWorkflowStep, index: number, currentIndex: number): string => {
    if (index < currentIndex) return 'bg-emerald-500 border-emerald-600';
    if (index === currentIndex) {
      if (step.status === 'IN_PROGRESS') return 'bg-blue-500 border-blue-600 animate-pulse';
      if (step.status === 'ON_HOLD' || step.status === 'PAUSED') return 'bg-amber-500 border-amber-600';
      return 'bg-blue-400 border-blue-500';
    }
    return 'bg-slate-200 border-slate-300';
  };

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {stepsToRender.map((step, index) => {
        const isCurrent = step.isCurrent;
        const colorClass = getStepColor(step as OrderWorkflowStep, step.originalIndex, snapshot.currentStepIndex);
        const navHref = getNavHref(step);

        const dot = (
          <div
            className={`w-3 h-3 rounded-full border ${colorClass} ${isCurrent ? 'ring-2 ring-blue-100 ring-offset-1' : ''} transition-all duration-300`}
          />
        );

        return (
          <div
            key={`${step.role}-${index}`}
            className="flex items-center group/step relative"
          >
            {navHref ? (
              <Link href={navHref} className="hover:scale-125 transition-transform">
                {dot}
              </Link>
            ) : (
              dot
            )}

            {index < stepsToRender.length - 1 && (
              <div
                className={`w-4 h-1 mx-0.5 rounded-full ${
                  step.originalIndex < snapshot.currentStepIndex ? 'bg-emerald-500' : 'bg-slate-200'
                } transition-all duration-300`}
              />
            )}

            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/step:block z-[60] pointer-events-none">
              <div className="bg-slate-800/95 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1.5 uppercase tracking-wider rounded-lg shadow-xl whitespace-nowrap flex flex-col items-center border border-slate-700/50">
                <span className="text-blue-300 text-[9px] mb-0.5 opacity-80">{step.role}</span>
                <span>{step.status.replace(/_/g, ' ')}</span>
                {navHref && <span className="text-indigo-400 text-[8px] mt-1 italic">Click to open</span>}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800/95" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
