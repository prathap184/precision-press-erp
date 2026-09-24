'use client';

import React, { useState } from 'react';
import { OrderWorkflowSnapshot, OrderWorkflowStep } from '@/types/workflow';
import { Check, Play, AlertCircle, Clock, Lock, ChevronRight, ExternalLink, CheckCircle2, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { StaffRole } from '@/types/roles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { acceptPrintJob, releasePrintJob } from '@/lib/workflow';
import { resolvePrintWorkflow } from '@/lib/tiff-utils';
import { toast } from 'react-hot-toast';

interface WorkflowPipelineVisualProps {
  snapshot?: OrderWorkflowSnapshot | null;
  orderId?: string;
  order?: any;
  className?: string;
  detailed?: boolean;
  filterByRoles?: boolean;
  allowNavigation?: boolean;
  deliveryChoice?: string;
  /** When set, ONLY steps whose role is in this list are clickable. All others are locked non-clickable divs. Used for role-scoped global orders pages. */
  lockedToRoles?: StaffRole[];
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
export function WorkflowPipelineVisual({
  snapshot,
  orderId,
  order,
  className = '',
  detailed = false,
  filterByRoles = false,
  allowNavigation = false,
  deliveryChoice,
  lockedToRoles,
}: WorkflowPipelineVisualProps): JSX.Element {
  let roles: StaffRole[] = [];
  let role: string | undefined;
  let user: any = null;
  let profile: any = null;
  const pathname = usePathname();

  try {
    const auth = useAuth();
    roles = auth.roles || [];
    role = auth.role || undefined;
    user = auth.user;
    profile = auth.profile;
  } catch {
    // fallback if outside AuthProvider
  }

  const [isAccepting, setIsAccepting] = useState(false);

  const currentUserId = profile?.uid || user?.uid || '';
  const isAdmin = roles.includes('SUPER_ADMIN' as StaffRole) || roles.includes('ADMIN' as StaffRole);
  const isPrinterUser = roles.includes('PRINTER' as StaffRole) || role === 'PRINTER';
  const isManager = roles.includes('MANAGER' as StaffRole) || role === 'MANAGER';
  const canAccept = isPrinterUser || isAdmin || isManager;

  const handleAcceptPrint = async (oId?: string) => {
    const targetId = oId || orderId || order?.id;
    if (!targetId || isAccepting) return;
    setIsAccepting(true);
    try {
      await acceptPrintJob(targetId);
      toast.success('Print job accepted!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept print job');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReleasePrint = async (oId?: string) => {
    const targetId = oId || orderId || order?.id;
    if (!targetId || isAccepting) return;
    setIsAccepting(true);
    try {
      await releasePrintJob(targetId);
      toast.success('Print job released');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to release print job');
    } finally {
      setIsAccepting(false);
    }
  };

  const defaultAcdemaRoles: StaffRole[] = ['ACCOUNTANT', 'DESIGNER', 'MANAGER'];
  const effectiveRolesSet = new Set<StaffRole>(roles);
  if (roles.includes('ACDEMA' as StaffRole) || role === 'ACDEMA') {
    defaultAcdemaRoles.forEach((r) => effectiveRolesSet.add(r));
  }
  const effectiveRoles = Array.from(effectiveRolesSet);

  if (!snapshot || !snapshot.steps || snapshot.steps.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-slate-400 font-mono ${className}`}>
        <Clock size={12} />
        <span>Workflow Initializing...</span>
      </div>
    );
  }

  const isDeliverySkipped = ['pickup', 'counter', 'selfpickup'].includes((deliveryChoice || '').toLowerCase());

  let stepsToRender = snapshot.steps.map((step, index) => ({
    ...step,
    originalIndex: index,
    isCurrent: index === snapshot.currentStepIndex && step.status !== 'COMPLETED',
    isCompleted: index < snapshot.currentStepIndex || step.status === 'COMPLETED',
  }));

  if (filterByRoles && roles.length > 0 && !isAdmin) {
    stepsToRender = stepsToRender.filter((s) => effectiveRoles.includes(s.role));
  }

  if (isDeliverySkipped) {
    stepsToRender = stepsToRender.filter((s) => s.role !== 'DELIVERY');
  }

  if (stepsToRender.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-slate-400 font-mono ${className}`}>
        <Lock size={12} />
        <span>Stage Restricted</span>
      </div>
    );
  }

  const canNavigateToStage = (step: typeof stepsToRender[0]): boolean => {
    // COMPULSORY: If a step is neither current nor completed, it is a future/pending stage.
    // Preceding stages must be completed first; future stages cannot be opened by anyone.
    if (!step.isCurrent && !step.isCompleted) {
      return false;
    }

    const isAcdemaUser = roles.includes('ACDEMA' as StaffRole) || role === 'ACDEMA' || effectiveRoles.includes('ACDEMA' as StaffRole);
    const acdemaManagedRoles: StaffRole[] = ['ACCOUNTANT', 'DESIGNER', 'MANAGER'];

    // If stage is neither completed nor current, preceding stages are not completed -> strictly locked
    if (!step.isCompleted && !step.isCurrent) {
      return false;
    }

    // PRINTER SPECIFIC COLLISION LOCK:
    // If another printer accepted this job, lock navigation for other printer accounts (Admin only can override)
    if (step.role === 'PRINTER') {
      const printWf = resolvePrintWorkflow(order);
      const printerAcceptedBy = (step as any).acceptedBy || printWf?.printerAcceptedBy || (order as any)?.printerAcceptedBy;
      if (printerAcceptedBy && printerAcceptedBy !== currentUserId && !isAdmin) {
        return false;
      }
    }

    // If lockedToRoles is provided, ONLY allow clicking steps that match the viewer's role(s)
    if (lockedToRoles && lockedToRoles.length > 0) {
      const allowedSet = new Set<StaffRole>(lockedToRoles);
      if (allowedSet.has('ACDEMA' as StaffRole) || isAcdemaUser) {
        allowedSet.add('ACCOUNTANT' as StaffRole);
        allowedSet.add('DESIGNER' as StaffRole);
        allowedSet.add('MANAGER' as StaffRole);
      }
      return allowedSet.has(step.role as StaffRole);
    }

    if (isAdmin) return true;

    // ACDEMA has permanent open access to its triad stages (Accounts, Design, Manager)
    if (isAcdemaUser && acdemaManagedRoles.includes(step.role)) {
      return true;
    }

    if (step.isCurrent) {
      return effectiveRoles.includes(step.role);
    }
    if (step.isCompleted) {
      return effectiveRoles.includes(step.role);
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
      const pPath = isAdmin ? `/admin/orders/${orderId}` : `/printer/orders/${orderId}`;
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
    const printWf = resolvePrintWorkflow(order);

    return (
      <div className={`flex flex-nowrap items-start gap-x-0.5 pb-1 ${className}`}>
        {stepsToRender.map((step, index) => {
          const isCurrent = step.isCurrent;
          const isCompleted = step.isCompleted;
          const navHref = getNavHref(step);

          const printerAcceptedBy = step.role === 'PRINTER' 
            ? ((step as any).acceptedBy || printWf?.printerAcceptedBy || (order as any)?.printerAcceptedBy || (order as any)?.workflow?.assignedTo)
            : null;
          const printerAcceptedByName = step.role === 'PRINTER'
            ? ((step as any).acceptedByName || printWf?.printerAcceptedByName || (order as any)?.printerAcceptedByName || (order as any)?.workflow?.assignedToName)
            : null;

          const rawPrinterName = printerAcceptedByName || (
            printerAcceptedBy === currentUserId 
              ? (profile?.name || user?.displayName || user?.email?.split('@')[0] || 'You')
              : 'Printer'
          );
          const cleanPrinterName = rawPrinterName.includes('@') ? rawPrinterName.split('@')[0] : rawPrinterName;

          let bgClass = 'bg-slate-100/90 text-slate-500 border-slate-200 shadow-2xs';
          let icon = <Lock size={13} className="text-slate-400 shrink-0" />;
          let chevronClass = 'text-slate-400';

          if (isCompleted) {
            bgClass = 'bg-indigo-50/90 text-indigo-950 border-indigo-300 shadow-2xs';
            icon = <Check size={12} className="text-indigo-700 shrink-0 stroke-[3]" />;
            chevronClass = 'text-indigo-400';
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

          const displayLabel = SHORT_STEP_LABELS[step.label] || SHORT_STEP_LABELS[step.role] || step.label;
          const pillContent = (
            <>
              {icon}
              <span className="font-normal text-slate-800 whitespace-nowrap text-[14px]">{displayLabel}</span>
              {navHref && <ExternalLink size={10} className="shrink-0 opacity-60 ml-0.5" />}
            </>
          );

          const pillBase = `w-[98px] h-[27px] flex items-center justify-center gap-1.5 px-2 rounded-md border text-[14px] font-normal tracking-normal transition-all duration-200 select-none shadow-2xs ${bgClass}`;

          const pillTooltip = (step.role === 'PRINTER' && printerAcceptedByName && printerAcceptedBy !== currentUserId)
            ? `Already accepted by ${printerAcceptedByName}`
            : `${step.label} (${step.role}): ${step.status.replace(/_/g, ' ')}`;

          return (
            <div key={`${step.role}-${index}`} className="flex items-start shrink-0">
              <div className="flex flex-col items-center">
                {navHref ? (
                  <Link
                    href={navHref}
                    className={`${pillBase} hover:brightness-95 hover:scale-105 cursor-pointer`}
                    title={`Open ${step.label} (${step.role})`}
                  >
                    {pillContent}
                  </Link>
                ) : (
                  <div className={pillBase} title={pillTooltip}>
                    {pillContent}
                  </div>
                )}

                {/* Print stage action button / status indicator */}
                {step.role === 'PRINTER' && (
                  <div className="w-[98px] flex items-center justify-center min-h-[22px]">
                    {step.isCompleted ? (
                      cleanPrinterName ? (
                        <span 
                          className="mt-1 text-[10px] text-slate-500 font-bold truncate max-w-[98px]"
                          title={`Printed by ${cleanPrinterName}`}
                        >
                          ✓ {cleanPrinterName}
                        </span>
                      ) : null
                    ) : step.isCurrent ? (
                      printerAcceptedBy ? (
                        printerAcceptedBy === currentUserId ? (
                          <div 
                            className="mt-1 flex items-center justify-between gap-1 w-full px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-300 text-[10px] font-bold shadow-2xs"
                            title={`Accepted by you (${cleanPrinterName})`}
                          >
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
                              <span className="truncate max-w-[65px] font-bold text-emerald-900" title={cleanPrinterName}>
                                {cleanPrinterName}
                              </span>
                            </div>
                            {(isAdmin || isManager || isPrinterUser) && (
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleReleasePrint(orderId);
                                }}
                                disabled={isAccepting}
                                title="Release / Unclaim this job" 
                                className="text-slate-400 hover:text-red-600 hover:bg-slate-200/60 rounded p-0.5 ml-0.5 cursor-pointer shrink-0"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div 
                            className="mt-1 flex items-center justify-between gap-1 w-full px-1.5 py-0.5 rounded bg-amber-50 text-amber-950 border border-amber-300 text-[10px] font-bold shadow-2xs select-none"
                            title={`Already accepted by ${cleanPrinterName}`}
                          >
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <Lock size={9} className="text-amber-600 shrink-0" />
                              <span className="truncate max-w-[65px] font-bold text-amber-950" title={cleanPrinterName}>
                                {cleanPrinterName}
                              </span>
                            </div>
                            {(isAdmin || isManager) && (
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleReleasePrint(orderId);
                                }}
                                disabled={isAccepting}
                                title="Manager Override: Release job" 
                                className="text-slate-400 hover:text-red-600 hover:bg-slate-200/60 rounded p-0.5 ml-0.5 cursor-pointer shrink-0"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        )
                      ) : canAccept ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAcceptPrint(orderId);
                          }}
                          disabled={isAccepting}
                          className="mt-1 flex items-center justify-center gap-1 w-full h-[22px] px-2 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          title="Accept this print job for your account"
                        >
                          {isAccepting ? (
                            <Loader2 size={10} className="animate-spin shrink-0" />
                          ) : (
                            <Check size={11} className="stroke-[3] shrink-0" />
                          )}
                          <span>Accept</span>
                        </button>
                      ) : (
                        <span className="mt-1 text-[10px] text-slate-400 font-medium">Unassigned</span>
                      )
                    ) : null}
                  </div>
                )}
              </div>

              {index < stepsToRender.length - 1 && (
                <ChevronRight
                  size={10}
                  className={`mx-0.5 mt-2 shrink-0 ${chevronClass}`}
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
