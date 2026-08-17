'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from '@/lib/supabase-firestore-shim';
import { Loader2, Printer, ExternalLink, Play, CheckCircle, ChevronLeft, Package, FileType, Copy, FileText, AlertTriangle, Clock, X } from 'lucide-react';
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
  const pathLabel = tiffInfo?.networkRoot || tiffInfo?.normalizedPath || tiffPath || 'â€”';

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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#ecd9fa]/65 via-[#f4f2f8]/90 to-[#daf4fc]/65">
        <div className="text-center space-y-4 p-8 rounded-3xl bg-white/40 backdrop-blur-md border border-white/50 shadow-lg">
          <Loader2 className="mx-auto animate-spin text-blue-600" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600/60">Loading printer order...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center bg-gradient-to-br from-[#ecd9fa]/65 via-[#f4f2f8]/90 to-[#daf4fc]/65">
        <div className="max-w-md space-y-6 p-8 rounded-3xl bg-white/40 backdrop-blur-md border border-white/50 shadow-lg">
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-blue-600">
          <Clock size={16} />
          <h3 className="text-[14px] font-black uppercase tracking-wider">TIFF Timeline</h3>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{printWorkflow?.timeline?.length || 0} events</p>
      </div>
      <div className="rounded-2xl border border-white/50 bg-white/40 backdrop-blur-md p-4 space-y-4">
        {printWorkflow?.timeline?.length ? (
          printWorkflow.timeline.map((entry: PrintWorkflowTimelineEntry, index: number) => (
            <div key={`${entry.event}-${index}`} className="flex items-start gap-3">
              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0 shadow-sm animate-pulse" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{entry.event.replace(/_/g, ' ')}</p>
                <p className="text-[13px] font-bold text-slate-800 mt-0.5">{entry.notes || 'Manager assigned TIFF to printer queue'}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-[11px] text-slate-500 italic">No TIFF timeline events yet.</div>
        )}
      </div>
    </div>
  );

  const jobSpecSection = (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-blue-600">
        <FileText size={16} />
        <h3 className="text-[14px] font-black uppercase tracking-wider">Job Specification Sheet</h3>
      </div>

      {itemsLoading ? (
        <div className="py-8 text-slate-400 flex items-center justify-center">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : uniqueDisplayItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 backdrop-blur-md px-6 py-8 text-center text-[14px] text-slate-500">
          No item details were found for this order.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/50 bg-white/40 backdrop-blur-md shadow-sm">
          <table className="w-full min-w-[700px] text-[13px] border-collapse">
            <thead>
              <tr className="bg-slate-100/50 border-b border-white/60 text-[10px] font-black uppercase tracking-wider text-slate-650">
                <th className="p-3.5 text-left border-r border-white/45">Item</th>
                <th className="p-3.5 text-left border-r border-white/45">Project</th>
                <th className="p-3.5 text-left border-r border-white/45">Tiff Path</th>
                <th className="p-3.5 text-center">Qty</th>
              </tr>
            </thead>
            <tbody>
              {uniqueDisplayItems.map((item) => {
                const itemTiffPath = item.tiffPath || tiffPath || '';
                const itemFileName = itemTiffPath ? getFileNameFromPath(itemTiffPath) : 'No TIFF path assigned';
                const itemReady = Boolean(itemTiffPath && isValidTiffPath(itemTiffPath));

                return (
                  <tr key={item.id} className="border-b border-white/40 last:border-b-0 hover:bg-white/30 transition-colors">
                    <td className="p-3.5 align-top border-r border-white/45">
                      <div className="font-bold text-slate-900">{(item as any).productName || item.productName || `Item ${item.id}`}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{`Size: ${(item as any).width ?? item.specs?.width ?? 0} x ${(item as any).height ?? item.specs?.height ?? 0} ${(item as any).widthUnit ?? item.specs?.widthUnit ?? 'FT'}`}</div>
                    </td>
                    <td className="p-3.5 align-top border-r border-white/45 text-slate-650 italic font-medium">{item.projectName || '—'}</td>
                    <td className="p-3.5 align-top border-r border-white/45">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[12px] font-semibold text-slate-900 break-all">{itemFileName}</p>
                          <p className="text-[10px] text-slate-500 mt-1.5 break-all font-mono bg-white/50 px-2 py-1.5 rounded-lg border border-slate-200/40">{itemTiffPath || 'No TIFF path assigned'}</p>
                        </div>
                        {itemReady && (
                          <button
                            type="button"
                            onClick={async () => {
                              const opened = await openTiffInSystem(itemTiffPath);
                              if (!opened) {
                                const fileUrl = normalizeTiffPathToFileUrl(itemTiffPath);
                                window.open(fileUrl, '_blank');
                              }
                            }}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-cyan-600 px-3.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-white hover:bg-cyan-750 hover:shadow-sm transition-all whitespace-nowrap shadow"
                          >
                            <ExternalLink size={10} /> Open
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 text-center align-top tabular-nums font-bold text-slate-800">{(item as any).quantity ?? item.specs?.quantity ?? 1}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const inner = (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Header Card */}
      {!hideHeader && (
        <section className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-16 h-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200/60 bg-white/60 shadow-sm">
                <OrderThumbnail orderId={order.id} order={order as any} size="full" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Order #{order.id.replace('ORD-', '')}</p>
                  <span className="inline-flex items-center rounded-full border border-slate-200/50 bg-slate-50/50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-600">
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <h1 className="mt-2 text-[18px] md:text-[20px] font-black tracking-tight text-slate-900 leading-none truncate">
                  {order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Unknown Customer'}
                </h1>
                <p className="text-[11px] text-slate-500 font-medium mt-1">
                  Placed on {order.createdAt ? new Date((order.createdAt as any).seconds ? (order.createdAt as any).seconds * 1000 : order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </p>
              </div>
            </div>

            <div className="lg:justify-self-end w-full max-w-[300px] ml-auto space-y-3">
              <div className="rounded-2xl border border-cyan-100/80 bg-cyan-50/60 p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-cyan-900">TIFF Path</p>
                  <span className="text-cyan-700 cursor-pointer hover:text-cyan-950 transition-colors" onClick={copyPath} title="Copy TIFF Path">
                    <Copy size={12} />
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] font-bold text-slate-900 truncate" title={fileName}>{fileName}</p>
                <p className="mt-0.5 text-[9px] font-semibold text-slate-500 truncate" title={pathLabel}>{pathLabel}</p>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button 
                  type="button"
                  onClick={() => router.push(backHref)} 
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 backdrop-blur-md px-4 h-9 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-white hover:shadow transition-all duration-200"
                >
                  <ChevronLeft size={12} /> Back
                </button>
                {tiffReady && (
                  <button
                    type="button"
                    onClick={openTiff}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-cyan-600 px-4 h-9 text-[10px] font-black uppercase tracking-widest text-white hover:bg-cyan-700 shadow transition-all duration-200"
                  >
                    <ExternalLink size={12} /> Open
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleWorkDone}
                  disabled={processing || mode === 'READ_ONLY'}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 h-9 text-[10px] font-black uppercase tracking-widest text-white transition-all shadow duration-200 ${
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
          </div>
        </section>
      )}

      {mode === 'READ_ONLY' && (
        <div className="rounded-2xl bg-blue-50/60 p-4 flex items-start gap-3 border border-blue-100 text-slate-800">
          <span className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-lg leading-none">visibility</span>
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Read Only Mode</p>
            <p className="text-[14px] font-bold text-blue-900 mt-1">This stage has already been completed.</p>
            <p className="text-[12px] text-blue-700/80 mt-0.5 font-medium">Uploads and workflow actions are disabled for this stage.</p>
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

      {/* Customer Notes */}
      {(() => {
        const notesContent = order.productionNotes || (order as any).production_notes || order.notes || order.customerNotes || (order as any).customer_notes || (order as any).remarks || (order as any).metadata?.notes || (order as any).metadata?.productionNotes || (order as any).additionalNotes;
        return (
          <div className={`w-full rounded-2xl p-4 border flex items-center gap-3 ${notesContent ? 'bg-amber-50/80 border-amber-200/80 shadow-sm' : 'bg-slate-50/80 border-slate-200/80'}`}>
            <span className={`material-symbols-outlined ${notesContent ? 'text-amber-600' : 'text-purple-400'}`}>notes</span>
            <span className={`text-[10px] font-black tracking-widest uppercase ${notesContent ? 'text-amber-800' : 'text-slate-500'}`}>Customer Notes:</span>
            <span className={`text-sm font-semibold ${notesContent ? 'text-slate-900' : 'text-slate-500'}`}>{notesContent || "No customer notes provided."}</span>
          </div>
        );
      })()}

      {/* 📄 Job Specification Sheet Section 📄 */}
      <div className="w-full pt-4 border-t border-slate-200/60 space-y-4">
        {jobSpecSection}
      </div>

      {/* ── Enterprise MES Workflow Timeline ── */}
      <div className="w-full pt-4 border-t border-slate-200/60 space-y-4">
        <WorkflowTimeline orderId={orderId} />
      </div>

      {/* ── TIFF Timeline Section ── */}
      <div className="w-full pt-4 border-t border-slate-200/60 space-y-4">
        {tiffTimelineSection}
      </div>
    </div>
  );

  return (
    <div className="font-sans text-slate-800 bg-gradient-to-br from-[#cad6fa] via-[#d4e4fc] to-[#bce1f8] -m-4 p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8 relative z-10 min-h-[calc(100vh-4rem)] rounded-none overflow-hidden pb-12">
      {/* Dynamic Glassmorphism Background with glowing orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#93c5fd]/30 blur-[140px] pointer-events-none animate-pulse"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[#c4b5fd]/30 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-[#a5f3fc]/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* ONE Master Glass Container */}
      <div className="relative z-10 rounded-[2.5rem] bg-white/60 backdrop-blur-xl shadow-lg border border-white/50 p-6 md:p-8 space-y-8">
        {inner}
      </div>
    </div>
  );
}



