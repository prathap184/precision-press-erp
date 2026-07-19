'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  limit
} from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { Order } from '@/types/models';
import { UserRole } from '@/types/auth';
import { filterActiveJobs, getStepForRole } from '@/lib/role-workflow-utils';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { Loader2, ArrowUpRight, Eye, FileText, UserCheck, Users } from 'lucide-react';
import { format } from 'date-fns';
import { UserProfile } from '@/types/auth';
import { useRouter } from 'next/navigation';

interface RoleActiveJobsProps {
  role: UserRole;
  printerCategory?: string;
  userId?: string;
  onJobsUpdate?: (orders: Order[]) => void;
  maxHeight?: string;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  dataMode?: 'role-workflow' | 'role-completed-by-me' | 'role-completed-all' | 'manager-printer-assignments' | 'printer-completed-by-me';
  assignmentScope?: 'mine' | 'all';
  assignedByUserId?: string;
  staffProfiles?: UserProfile[];
  orderHrefBuilder?: (job: Order) => string;
  activeScope?: 'mine' | 'all';
  stageFlowSingleLine?: boolean;
}

export function RoleActiveJobs({ 
  role, 
  printerCategory,
  userId,
  onJobsUpdate,
  maxHeight = '160px',
  title = 'Active Jobs',
  subtitle = 'Accepted by accountant',
  emptyMessage = 'No active jobs.',
  dataMode = 'role-workflow',
  assignmentScope = 'mine',
  assignedByUserId,
  staffProfiles = [],
  orderHrefBuilder,
  activeScope = 'mine',
  stageFlowSingleLine = false
}: RoleActiveJobsProps) {
  const [activeJobs, setActiveJobs] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const profileLookup = React.useMemo(() => {
    const map = new Map<string, string>();
    staffProfiles.forEach((profile) => {
      map.set(profile.uid, profile.displayName || profile.name || profile.email || profile.uid);
    });
    return map;
  }, [staffProfiles]);

  useEffect(() => {
    // Listen to all orders
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      
      const passesCategoryCheck = (order: Order) => {
        if (!printerCategory || printerCategory === 'MAIN_PRINTER') return true;
        const normalizeCat = (cat?: string | null) => {
          let c = (cat || '').toUpperCase().replace(/[^A-Z_]/g, '').replace('ECOSOLVENT', 'ECO_SOLVENT');
          if (c === 'IDCARDS' || c === 'ID_CARDS') return 'ID_CARDS';
    if (c === 'DIGITAL' || c === 'DIGITAL_PRINT') return 'DIGITAL_PRINT';
          return c;
        };
        const userCat = normalizeCat(printerCategory);
        let orderCat = normalizeCat(order.printerCategory);
        
        if (!orderCat) {
           const firstItem = order.items?.[0] as any;
           const firstItemName = firstItem?.productName || firstItem?.name;
           if (firstItemName) {
              const itemName = firstItemName.toLowerCase();
              if (itemName.includes('eco')) orderCat = 'ECO_SOLVENT';
              else if (itemName.includes('uv')) orderCat = 'UV_PRINT';
              else if (itemName.includes('sol') || itemName.includes('solvent')) orderCat = 'SOLVENT_PRINT';
              else if (itemName.includes('latex')) orderCat = 'LATEX_PRINT';
              else if (itemName.includes('id card') || itemName.includes('visitor pass') || itemName.includes('membership') || itemName.includes('loyalty') || itemName.includes('access card') || itemName.includes('proximity') || itemName.includes('lanyard') || itemName.includes('holder') || itemName.includes('yo-yo')) orderCat = 'ID_CARDS';
        else if (itemName.includes('dig') || itemName.includes('digital') || itemName.includes('vinyl') || itemName.includes('art paper') || itemName.includes('art card') || itemName.includes('sticker paper') || itemName.includes('envelope') || itemName.includes('invitation card') || itemName.includes('menu card') || itemName.includes('calendar sheet')) orderCat = 'DIGITAL_PRINT';
        else if (itemName.includes('flex')) orderCat = 'FLEX_PRINT';
           }
        }
        return orderCat === userCat;
      };

      // Manager page can switch between only own printer assignments and all printer assignments.
      const filtered = dataMode === 'manager-printer-assignments'
        ? allOrders.filter((order) => {
            if (!passesCategoryCheck(order)) return false;
            const hasPrinterAssignment = Boolean(order.workflow?.assignedTo);
            const isPrinterStage = order.currentWorkflowRole === 'PRINTER' || order.workflowSnapshot?.steps?.[order.workflowSnapshot.currentStepIndex || 0]?.role === 'PRINTER';
            const isPrinterActiveStatus = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(order.status as string) || isPrinterStage;
            const isOwnedByCurrentManager = assignmentScope === 'all' || !assignedByUserId
              ? true
              : order.workflow?.assignedBy === assignedByUserId;

            return hasPrinterAssignment && isPrinterActiveStatus && isOwnedByCurrentManager;
          })
        : dataMode === 'printer-completed-by-me'
          ? allOrders.filter((order) => {
              if (!passesCategoryCheck(order)) return false;
              if (!assignedByUserId) return false;

              const printWorkflow = order.workflow?.printWorkflow || order.printWorkflow;
              const wasCompleted = Boolean(printWorkflow?.printerCompleted);
              if (!wasCompleted) return false;

              const completedByField = printWorkflow?.printerCompletedBy;
              const acceptedByField = printWorkflow?.printerAcceptedBy;
              if (completedByField && acceptedByField) {
                return completedByField === assignedByUserId && acceptedByField === assignedByUserId;
              }

              const timeline = Array.isArray(printWorkflow?.timeline)
                ? (printWorkflow.timeline as Array<{ event?: string; user?: string }>)
                : [];
              const startedByMe = timeline.some((entry) => entry?.event === 'PRINT_STARTED' && entry?.user === assignedByUserId);
              const completedByMe = timeline.some((entry) => entry?.event === 'PRINT_COMPLETED' && entry?.user === assignedByUserId);
              return startedByMe && completedByMe;
            })
        : dataMode === 'role-completed-by-me'
          ? allOrders.filter((order) => {
              if (!passesCategoryCheck(order)) return false;
              if (!userId) return false;
              const roleStep = getStepForRole(order, role);
              if (!roleStep || roleStep.status !== 'COMPLETED') return false;
              return roleStep.completedBy === userId || order.workflow?.assignedTo === userId || order.workflow?.assignedBy === userId;
            })
        : dataMode === 'role-completed-all'
          ? allOrders.filter((order) => {
              if (!passesCategoryCheck(order)) return false;
              const roleStep = getStepForRole(order, role);
              return Boolean(roleStep && roleStep.status === 'COMPLETED');
            })
        : filterActiveJobs(allOrders, role, userId, activeScope, printerCategory);

      setActiveJobs(filtered);
      onJobsUpdate?.(filtered);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [role, printerCategory, userId, onJobsUpdate, dataMode, assignmentScope, assignedByUserId, activeScope]);

  const formatDate = (value: unknown) => {
    if (!value) return '—';
    try {
      const maybeTimestamp = value as { seconds?: number };
      const date = maybeTimestamp?.seconds ? new Date(maybeTimestamp.seconds * 1000) : new Date(value as string);
      if (isNaN(date.getTime())) return '—';
      return format(date, 'dd MMM yyyy, hh:mm a');
    } catch {
      return '—';
    }
  };

  const getProofHref = (job: Order) => {
    return job.workflow?.customerDesignUrl || job.workflow?.designUrl || job.thumbnailUrl || null;
  };

  const getPersonLabel = (userId?: string | null, fallback?: string | null) => {
    if (!userId && !fallback) return '—';
    if (fallback) return fallback;
    return profileLookup.get(userId || '') || userId || '—';
  };

  const getTiffLocation = (job: Order) => {
    return job.printWorkflow?.tiffPath || job.printWorkflow?.networkFolder || '—';
  };

  const renderStageTrail = (job: Order) => {
    const steps = job.workflowSnapshot?.steps || [];
    const currentIndex = job.workflowSnapshot?.currentStepIndex ?? 0;

    if (steps.length === 0) {
      return <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">No workflow</span>;
    }

    return (
      <div className={`max-w-full flex items-center gap-1.5 ${stageFlowSingleLine ? 'flex-nowrap' : 'flex-wrap'}`}>
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isCompleted = index < currentIndex || step.status === 'COMPLETED';
          const isHeld = step.status === 'ON_HOLD' || step.status === 'PAUSED' || step.status === 'REJECTED';

          const chipClass = isCurrent
            ? isHeld
              ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-100'
              : 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-100 shadow-sm'
            : isCompleted
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-slate-50 text-slate-400 border-slate-200';

          return (
            <React.Fragment key={`${job.id}-${step.id}-${index}`}>
                <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${stageFlowSingleLine ? 'whitespace-nowrap' : 'whitespace-normal'} ${chipClass}`}
                title={`${step.role}: ${step.status.replace(/_/g, ' ')}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-white' : isCompleted ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span>{step.label}</span>
                {isCurrent && <span className="ml-0.5 text-[8px] opacity-80">now</span>}
              </span>
              {index < steps.length - 1 && (
                <span className={`h-px w-3 rounded-full ${index < currentIndex ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.25em]">{title}</h3>
        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{subtitle}</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-8 flex-1 items-center">
          <Loader2 className="animate-spin text-slate-400 h-5 w-5" />
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-bold text-[10px] flex-1 flex items-center justify-center uppercase tracking-wider">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex-1 overflow-auto" style={{ maxHeight: maxHeight === 'none' ? undefined : maxHeight }}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Date</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Job Ref</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stage / Ref</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proof</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeJobs.map((job) => {
                const proofHref = getProofHref(job);
                const currentStep = job.workflowSnapshot?.steps?.[job.workflowSnapshot.currentStepIndex || 0];
                const printWorkflow = job.workflow?.printWorkflow || job.printWorkflow;
                const nextPrinter = getPersonLabel(job.workflow?.assignedTo, job.workflow?.assignedToName || null);
                const acceptedBy = dataMode === 'printer-completed-by-me'
                  ? getPersonLabel(printWorkflow?.printerAcceptedBy, printWorkflow?.printerAcceptedByName || null)
                  : getPersonLabel(job.workflow?.assignedBy, job.workflow?.assignedByName || null);
                const tiffLocation = getTiffLocation(job);
                return (
                  <tr
                    key={job.id}
                    className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${orderHrefBuilder ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      const href = orderHrefBuilder?.(job);
                      if (href) router.push(href);
                    }}
                  >
                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                          <OrderThumbnail orderId={job.id} />
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-blue-600 uppercase tracking-tight leading-none">
                            {job.id.slice(0, 3)}-{job.id.slice(-6)}
                          </p>
                          <p className="text-[9px] text-slate-400 font-bold mt-1">
                            {formatDate(job.createdAt)}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{job.id}</p>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                          <Eye size={12} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">
                            {job.customerSnapshot?.displayName || job.customerSnapshot?.name || 'Direct Client'}
                          </p>
                          <p className="text-[9px] text-slate-400 uppercase tracking-widest">
                            {job.customerSnapshot?.phone || job.customerSnapshot?.email || 'No contact'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <p className="text-sm font-black text-slate-900">₹{(job.amounts?.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex flex-col gap-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex w-fit px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700">
                            Accepted
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-600">
                            <UserCheck size={10} /> {acceptedBy}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                          {currentStep?.label || job.currentWorkflowLabel || 'Next stage'}
                        </p>
                        <div className="flex flex-col gap-1 text-[9px] text-slate-500">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Users size={10} className="shrink-0 text-slate-400" />
                            <span className="truncate uppercase tracking-wider">Next printer: {nextPrinter}</span>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText size={10} className="shrink-0 text-slate-400" />
                            <span className="truncate font-mono normal-case tracking-normal">TIFF: {tiffLocation}</span>
                          </div>
                        </div>
                        <div className={`pt-1 ${stageFlowSingleLine ? 'overflow-x-auto no-scrollbar' : 'overflow-visible'}`}>
                          {renderStageTrail(job)}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      {proofHref ? (
                        <Link
                          href={proofHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider hover:bg-blue-100 transition-colors"
                        >
                          Link <ArrowUpRight size={12} />
                        </Link>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={orderHrefBuilder?.(job) || `/admin/orders/${job.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 text-white border border-slate-900 text-[10px] font-black uppercase tracking-wider hover:bg-slate-700 transition-colors"
                        >
                          Open <ArrowUpRight size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


