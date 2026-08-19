'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from '@/lib/supabase-firestore-shim';
import { Loader2, Printer, ExternalLink, Play, CheckCircle, ChevronLeft, Package, FileType, Copy, FileText, AlertTriangle, Clock, X, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { db } from '@/lib/firebase';
import { Order, OrderItem, PrintWorkflowItemAssignment, PrintWorkflowTimelineEntry } from '@/types/models';
import { STATUS_COLORS, STATUS_LABELS } from '@/types/workflow';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { getWorkspaceMode, WorkspaceMode } from '@/lib/workspaceAccess';
import { WorkflowAttachments } from '@/components/production/WorkflowAttachments';
import { completeTiffPrint, markTiffOpened, pauseJob, resumeJob, startTiffPrint } from '@/lib/workflow';
import { openTiffInSystem, resolvePrintWorkflow, getFileNameFromPath, inspectTiffPath, isValidTiffPath, normalizeTiffPathToFileUrl } from '@/lib/tiff-utils';
import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel';
import { WorkflowTimeline } from '@/components/orders/WorkflowTimeline';

interface PrinterOrderWorkspaceProps {
  orderId: string;
  backHref: string;
  backLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  headerLabel?: string;
  headerDescription?: string;
  framed?: boolean;
  hideHeader?: boolean;
}

function StatusChip({ label, tone, title }: { label: string; tone: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border ${tone}`}>
      {label}
    </span>
  );
}

export function PrinterOrderWorkspace({
  orderId,
  backHref,
  backLabel,
  secondaryHref,
  secondaryLabel,
  headerLabel = 'Printer Order Detail',
  headerDescription = 'Open the job, inspect the TIFF, and move the print workflow forward.',
  framed = true,
  hideHeader = false,
}: PrinterOrderWorkspaceProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setItemsLoading(true);

      try {
        let resolvedOrder: Order | null = null;

        try {
          const directSnap = await getDoc(doc(db, 'orders', orderId));
          if (directSnap.exists()) {
            resolvedOrder = { id: directSnap.id, ...directSnap.data() } as Order;
          }
        } catch (err) {
          console.error('Failed direct printer order lookup:', err);
        }

        if (!resolvedOrder) {
          const fallbackSnap = await getDocs(query(collection(db, 'orders'), where('id', '==', orderId), limit(1)));
          if (!fallbackSnap.empty) {
            const docSnap = fallbackSnap.docs[0];
            resolvedOrder = { id: docSnap.id, ...docSnap.data() } as Order;
          }
        }

        if (!resolvedOrder) {
          if (cancelled) return;
          setError('Order not found.');
          setOrder(null);
          return;
        }

        if (cancelled) return;
        setOrder(resolvedOrder);
        setError(null);

        try {
          const itemsSnap = await getDocs(query(collection(db, `orders/${resolvedOrder.id}/items`), orderBy('createdAt', 'asc')));
          if (!cancelled) {
            setItems(itemsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as OrderItem)));
          }
        } catch (err) {
          console.error('Failed to load order items:', err);
          if (!cancelled) {
            setItems([]);
          }
        } finally {
          if (!cancelled) {
            setItemsLoading(false);
          }
        }
      } catch (err) {
        console.error('Failed to resolve order id for printer workspace:', err);
        if (!cancelled) {
          setError('Unable to load this order.');
          setOrder(null);
          setItems([]);
          setItemsLoading(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const currentStep = order?.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? -1];
  const mode = getWorkspaceMode('PRINTER', order?.workflowSnapshot);
  const printWorkflow = useMemo(() => resolvePrintWorkflow(order), [order]);
  const tiffPath = printWorkflow?.tiffPath || '';
  const tiffInfo = tiffPath ? inspectTiffPath(tiffPath) : null;
  const tiffReady = Boolean(tiffPath && isValidTiffPath(tiffPath));
  const fileName = tiffInfo?.fileName || getFileNameFromPath(tiffPath);
  const pathLabel = tiffInfo?.networkRoot || tiffInfo?.normalizedPath || tiffPath || '—';

  const rawCustomerDesignFiles = Array.isArray(order?.workflow?.customerDesignFiles)
    ? order.workflow.customerDesignFiles
    : [];
  const designItems = rawCustomerDesignFiles
    .flatMap((entry: any) => (Array.isArray(entry?.items) ? entry.items : [entry]))
    .map((item: any) => ({
      id: item?.itemId || item?.id || `design-${Math.random().toString(36).slice(2, 8)}`,
      productName: item?.productName || 'Design Item',
      specs: { quantity: item?.quantity || 1 },
      tiffPath: item?.tiffPath || '',
    } as OrderItem));
  const fallbackDesignRef = order?.workflow?.customerDesignUrl || order?.thumbnailUrl || '';

  const itemAssignments = new Map<string, PrintWorkflowItemAssignment>(
    (order?.workflow?.printWorkflow?.itemAssignments ?? []).map((assignment) => [assignment.itemId, assignment])
  );

  let parsedOrderItems: OrderItem[] = [];
  if (Array.isArray(order?.items)) {
    parsedOrderItems = order.items;
  } else if (typeof order?.items === 'string') {
    try {
      parsedOrderItems = JSON.parse(order.items);
    } catch (e) {
      console.error('Failed to parse order.items string in PrinterOrderWorkspace');
    }
  }

  const sourceItems: OrderItem[] = items.length > 0
    ? items.map(item => {
        const matching = parsedOrderItems.find(o => o.id === item.id);
        if (matching) {
          return {
            ...matching,
            ...item,
            specs: typeof item.specs === 'object' && Object.keys(item.specs || {}).length > 0 ? { ...matching.specs, ...item.specs } : matching.specs,
            materialMetadata: typeof item.materialMetadata === 'object' && Object.keys(item.materialMetadata || {}).length > 0 ? { ...matching.materialMetadata, ...item.materialMetadata } : matching.materialMetadata,
            pricingSnapshot: typeof item.pricingSnapshot === 'object' && Object.keys(item.pricingSnapshot || {}).length > 0 ? { ...matching.pricingSnapshot, ...item.pricingSnapshot } : matching.pricingSnapshot,
            projectName: item.projectName || matching.projectName,
            productName: item.productName || matching.productName,
          } as OrderItem;
        }
        return item;
      })
    : parsedOrderItems.length > 0
      ? parsedOrderItems
      : [];

  const mappedItems: OrderItem[] = sourceItems.map((item) => {
    const itemId = item.id || (item as any).itemId || '';
    const assignment = itemAssignments.get(itemId);

    return {
      ...item,
      tiffPath: item.tiffPath || assignment?.tiffPath || '',
      assignedPrinterId: item.assignedPrinterId || assignment?.printerId || '',
      assignedPrinterName: item.assignedPrinterName || assignment?.printerName || '',
    } as OrderItem;
  });

  const fallbackItemsFromAssignments: OrderItem[] = mappedItems.length === 0 && itemAssignments.size > 0
    ? Array.from(itemAssignments.values()).map((assignment) => ({
        id: assignment.itemId,
        itemId: assignment.itemId,
        orderId: order?.id || '',
        productId: assignment.itemId,
        productName: `Item ${assignment.itemId}`,
        specs: { width: 0, height: 0, quantity: 1, sqft: 0, widthUnit: 'IN', heightUnit: 'IN' },
        materialMetadata: { materialType: 'UNKNOWN', eyeletType: 'NONE', eyeletCount: 0 },
        pricingSnapshot: { baseRate: 0, eyeletRate: 0, subTotal: 0, tax: 0 },
        fileUrl: '',
        tiffPath: assignment.tiffPath,
        assignedPrinterId: assignment.printerId,
        assignedPrinterName: assignment.printerName,
      } as OrderItem))
    : [];

  const displayItems: OrderItem[] = mappedItems.length > 0
    ? mappedItems
    : designItems.length > 0
      ? designItems
      : fallbackItemsFromAssignments.length > 0
        ? fallbackItemsFromAssignments
        : fallbackDesignRef
          ? [{
              id: 'legacy-design',
              orderId: order?.id || '',
              productName: 'Design Reference',
              productId: 'legacy',
              category: 'Legacy',
              specs: { width: 0, height: 0, quantity: 1, sqft: 0, widthUnit: 'IN', heightUnit: 'IN' },
              materialMetadata: { materialType: 'UNKNOWN', eyeletType: 'NONE', eyeletCount: 0 },
              pricingSnapshot: { baseRate: 0, eyeletRate: 0, subTotal: 0, tax: 0 },
              fileUrl: fallbackDesignRef,
              tiffPath: tiffPath,
            } as OrderItem]
          : [];

  const uniqueDisplayItems = useMemo(() => {
    const seen = new Set<string>();
    return displayItems.filter((item) => {
      const key = String(item.id || item.tiffPath || item.fileUrl || '');
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [displayItems]);

  const copyPath = async () => {
    if (!tiffPath) return;
    try {
      await navigator.clipboard.writeText(tiffPath);
      setCopiedPath(true);
      toast.success('Path copied.');
      window.setTimeout(() => setCopiedPath(false), 1500);
    } catch {
      toast.error('Could not copy path.');
    }
  };

  const openTiff = async () => {
    if (!order) return;
    if (!tiffReady) {
      toast.error('No valid TIFF path is available for this job.');
      return;
    }

    toast.loading('Opening TIFF in system viewer...', { id: 'printer-order-tiff' });
    const openedNatively = await openTiffInSystem(tiffPath);
    if (!openedNatively) {
      window.open(normalizeTiffPathToFileUrl(tiffPath), '_blank', 'noopener,noreferrer');
    }

    try {
      await markTiffOpened(order.id);
      toast.success('TIFF opened.', { id: 'printer-order-tiff' });
    } catch (err) {
      console.error('Failed to mark TIFF as opened:', err);
      toast.success('TIFF opened.', { id: 'printer-order-tiff' });
    }
  };

  const handleWorkDone = async () => {
    if (!order || processing || isCompleted) return;

    setProcessing(true);
    try {
      const stepStatus = currentStep?.status;

      // One-click shortcut: if printer step is not started yet, start it first.
      if (order.status === 'ASSIGNED' || stepStatus === 'PENDING') {
        await startTiffPrint(order.id, 'Started from Work Done shortcut');
      }

      // If paused/on hold, resume before completion.
      if (stepStatus === 'PAUSED' || stepStatus === 'ON_HOLD') {
        await resumeJob(order.id, 'Resumed from Work Done shortcut');
      }

      await completeTiffPrint(order.id, 'Order marked as complete');
      setIsCompleted(true);
      toast.success('Printer work completed. Moving to next stage...');
      const returnTo = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
      try {
        const url = new URL(returnTo || backHref || '/admin/orders', window.location.origin);
        if (order?.id) {
          if (url.pathname.includes('/orders')) {
            url.searchParams.set('highlight', order.id);
          } else {
            url.searchParams.set('orderId', order.id);
          }
        }
        setTimeout(() => router.push(url.pathname + url.search), 700);
      } catch (e) {
        setTimeout(() => router.push(returnTo || backHref || '/admin/orders'), 700);
      }
    } catch (err) {
      console.error('Work Done shortcut failed:', err);
      toast.error('Failed to finish printer work. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!order || processing) return;
    setProcessing(true);
    try {
      if (order?.status === 'ASSIGNED' || currentStep?.status === 'PENDING') {
        await startTiffPrint(order.id);
      } else if (currentStep?.status === 'IN_PROGRESS') {
        await completeTiffPrint(order.id);
      } else if (currentStep?.status === 'PAUSED' || currentStep?.status === 'ON_HOLD') {
        await resumeJob(order.id);
      }
    } catch (err) {
      console.error('Printer action failed:', err);
      toast.error('Action failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePause = async () => {
    if (!order || processing) return;
    const notes = window.prompt('Reason for pausing?') || '';
    setProcessing(true);
    try {
      await pauseJob(order.id, notes);
    } catch (err) {
      console.error('Pause failed:', err);
      toast.error('Pause failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="mx-auto animate-spin text-blue-600" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600/60">Loading printer order...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
        <div className="max-w-md space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Printer size={28} />
          </div>
          <div className="space-y-2">
            <h1 className="text-[28px] font-black tracking-tight text-slate-800">Printer Order Not Available</h1>
            <p className="text-[15px] text-slate-500 font-medium">{error || 'This order could not be loaded.'}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link href={backHref} className="rounded-full border border-slate-200 bg-white px-5 py-3 text-[14px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-50 shadow-sm">
              {backLabel}
            </Link>
            {secondaryHref && secondaryLabel && (
              <Link href={secondaryHref} className="rounded-full bg-primary px-5 py-3 text-[14px] font-black uppercase tracking-widest text-white transition-colors hover:bg-black shadow-sm">
                {secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const tiffTimelineSection = (
    <div className="rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2 text-blue-700">
          <Clock size={16} />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">TIFF Timeline</h3>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{printWorkflow?.timeline?.length || 0} events</p>
      </div>
      <div className="rounded-2xl border border-white/80 bg-white/70 backdrop-blur-md p-4 space-y-4 shadow-2xs">
        {printWorkflow?.timeline?.length ? (
          printWorkflow.timeline.map((entry: PrintWorkflowTimelineEntry, index: number) => (
            <div key={`${entry.event}-${index}`} className="flex items-start gap-3">
              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600 shrink-0 shadow-2xs" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{entry.event.replace(/_/g, ' ')}</p>
                <p className="text-[13px] font-black text-slate-900 mt-0.5">{entry.notes || 'Manager assigned TIFF to printer queue'}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-xs font-bold text-slate-500 italic">No TIFF timeline events yet.</div>
        )}
      </div>
    </div>
  );

  const jobSpecSection = (
    <div className="rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
        <FileText size={16} className="text-blue-700" />
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Job Specification Sheet</h3>
      </div>

      {itemsLoading ? (
        <div className="py-8 text-slate-400 flex items-center justify-center">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : uniqueDisplayItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/40 backdrop-blur-md px-6 py-8 text-center text-xs font-bold text-slate-600">
          No item details were found for this order.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-2xs">
          <table className="w-full min-w-[700px] text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-black uppercase tracking-wider text-slate-700">
                <th className="p-3.5 text-left border-r border-slate-200/80">Item</th>
                <th className="p-3.5 text-left border-r border-slate-200/80">Project</th>
                <th className="p-3.5 text-left border-r border-slate-200/80">Tiff Path</th>
                <th className="p-3.5 text-center">Qty</th>
              </tr>
            </thead>
            <tbody>
              {uniqueDisplayItems.map((item) => {
                const itemTiffPath = item.tiffPath || tiffPath || '';
                const itemFileName = itemTiffPath ? getFileNameFromPath(itemTiffPath) : 'No TIFF path assigned';
                const itemReady = Boolean(itemTiffPath && isValidTiffPath(itemTiffPath));

                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5 align-top border-r border-slate-100">
                      <div className="font-black text-slate-900">{(item as any).productName || item.productName || `Item ${item.id}`}</div>
                      <div className="text-[11px] font-bold text-slate-500 mt-1">{`Size: ${(item as any).width ?? item.specs?.width ?? 0} x ${(item as any).height ?? item.specs?.height ?? 0} ${(item as any).widthUnit ?? item.specs?.widthUnit ?? 'FT'}`}</div>
                    </td>
                    <td className="p-3.5 align-top border-r border-slate-100 text-slate-800 font-bold">{item.projectName || '—'}</td>
                    <td className="p-3.5 align-top border-r border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-black text-slate-900 break-all">{itemFileName}</p>
                          <p className="text-[10px] text-slate-600 mt-1.5 break-all font-mono bg-white px-2 py-1.5 rounded-lg border border-slate-200 shadow-2xs">{itemTiffPath || 'No TIFF path assigned'}</p>
                        </div>
                        {itemReady && (
                          <button
                            type="button"
                            onClick={async () => {
                              toast.loading('Opening TIFF...', { id: item.id });
                              const opened = await openTiffInSystem(itemTiffPath);
                              if (!opened) window.open(normalizeTiffPathToFileUrl(itemTiffPath), '_blank');
                              toast.success('TIFF opened.', { id: item.id });
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-cyan-600 hover:bg-cyan-700 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-white shadow-2xs transition-all shrink-0"
                          >
                            <ExternalLink size={10} /> Open
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 align-top text-center font-black text-slate-900">
                      {item.specs?.quantity || (item as any).quantity || 1}
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

  return (
    <div className="w-full font-sans text-slate-800 bg-[#d4d4d8] p-4 sm:p-6 md:p-8 relative z-10 min-h-[calc(100vh-4rem)] pb-12">
      {/* Exact Proxy Order Canvas Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/35 blur-[140px] pointer-events-none animate-pulse"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-sky-400/35 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-300/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* Page Content Stream (Modular Standalone Cards) */}
      <div className="relative z-10 w-full space-y-6">
        {/* Header Panel (Bold Command Headline) */}
        {!hideHeader && (
          <section className="w-full">
            <div className="flex flex-row items-center justify-between gap-4 flex-wrap md:flex-nowrap px-2 sm:px-3 md:px-4">
              <div className="flex flex-row items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-[28px] font-black tracking-tight text-slate-900 truncate">
                      Order #{order.id.replace('ORD-', '')} — {order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Unknown Customer'}
                    </h1>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/70 backdrop-blur-md px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-700 shadow-2xs">
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      {order.currentWorkflowLabel && (
                        <span className="inline-flex items-center rounded-full border border-purple-200/80 bg-purple-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-purple-700 shadow-2xs">
                          Step: {order.currentWorkflowLabel}
                        </span>
                      )}
                      {mode === 'READ_ONLY' && (
                        <span className="inline-flex items-center rounded-full border border-blue-200/80 bg-blue-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-blue-700 shadow-2xs">
                          • Read Only
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                    Placed on {order.createdAt ? new Date((order.createdAt as any).seconds ? (order.createdAt as any).seconds * 1000 : order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'} • {order.customerSnapshot?.companyName || 'Hindustan Enterprises'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button 
                  type="button"
                  onClick={() => router.push(backHref)} 
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 backdrop-blur-md px-4 h-9 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-white hover:shadow-sm transition-all duration-200"
                >
                  <ChevronLeft size={12} /> Back
                </button>
                {tiffReady && (
                  <button
                    type="button"
                    onClick={openTiff}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-cyan-600 hover:bg-cyan-700 px-4 h-9 text-[10px] font-black uppercase tracking-widest text-white shadow transition-all duration-200"
                  >
                    <ExternalLink size={12} /> Open TIFF
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleWorkDone}
                  disabled={processing || mode === 'READ_ONLY'}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-5 h-9 text-[10px] font-black uppercase tracking-widest text-white transition-all shadow duration-200 ${
                    mode === 'READ_ONLY' || isCompleted
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed border-slate-300 opacity-80'
                      : 'bg-slate-900 hover:bg-slate-800 disabled:opacity-50'
                  }`}
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : mode === 'READ_ONLY' ? (
                    <CheckCircle size={12} className="text-slate-400" />
                  ) : isCompleted ? (
                    <CheckCircle size={12} />
                  ) : (
                    <Play size={12} />
                  )}
                  {mode === 'READ_ONLY' ? 'Already Completed' : isCompleted ? 'Completed' : 'Work Done'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Read Only Mode Banner */}
        {mode === 'READ_ONLY' && (
          <div className="w-full rounded-[2rem] bg-blue-500/10 border border-blue-400/30 backdrop-blur-xl p-4 flex items-center gap-3.5 shadow-2xs">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-800 shrink-0">
              <Eye size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-700">Read Only Mode</span>
                <span className="text-[10px] font-bold text-slate-500">•</span>
                <span className="text-xs font-black text-slate-900">This stage has already been completed.</span>
              </div>
              <p className="text-[11px] font-bold text-slate-600 mt-0.5">Uploads and workflow actions are disabled for this stage.</p>
            </div>
          </div>
        )}

        {/* ── Full Booking Details ── */}
        <OrderDetailsPanel 
          order={order} 
          role="PRINTER" 
          items={items} 
          className="text-slate-800 w-full"
        />

        {/* 📄 Job Specification Sheet Section 📄 */}
        <div className="w-full space-y-4">
          {jobSpecSection}
        </div>

        {/* ── Enterprise MES Workflow Timeline ── */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
          <WorkflowTimeline orderId={orderId} />
        </div>

        {/* ── TIFF Timeline Section ── */}
        <div className="w-full space-y-4">
          {tiffTimelineSection}
        </div>
      </div>
    </div>
  );
}
