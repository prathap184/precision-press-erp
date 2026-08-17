'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Users, 
  Printer, 
  Activity, 
  Loader2, 
  CheckCircle, 
  UserPlus, 
  ShieldCheck, 
  Copy, 
  ExternalLink, 
  LayoutGrid, 
  ChevronLeft,
  Play,
  ArrowRight,
  AlertTriangle,
  Palette
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { getWorkspaceMode } from '@/lib/workspaceAccess';
import { db } from '@/lib/firebase';
import { collection, doc, onSnapshot, getDocs, query, where, limit } from '@/lib/supabase-firestore-shim';
import { Order, OrderItem, UserProfile } from '@/types/models';
import { assignPrinter, assignTiffToPrinter, assignItemTiffToPrinter, advanceOrderWorkflow } from '@/lib/workflow';
import { getFileNameFromPath, inspectTiffPath, isValidTiffPath, normalizeTiffPathToFileUrl, resolvePrintWorkflow, openTiffInSystem } from '@/lib/tiff-utils';
import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel';
import { WorkflowAttachments } from '@/components/production/WorkflowAttachments';

interface ManagerOrderWorkspaceProps {
  orderId: string;
}

export function ManagerOrderWorkspace({ orderId }: ManagerOrderWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [printers, setPrinters] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingItemKey, setProcessingItemKey] = useState<string | null>(null);

  const [tiffDrafts, setTiffDrafts] = useState<Record<string, string>>({});
  const [tiffErrors, setTiffErrors] = useState<Record<string, string>>({});
  const [workDoneLoading, setWorkDoneLoading] = useState(false);
  const [confirmWorkDone, setConfirmWorkDone] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    // Listen to order
    const unsubOrder = onSnapshot(doc(db, 'orders', orderId), (snapshot) => {
      if (snapshot.exists()) {
        setOrder({ id: snapshot.id, ...snapshot.data() } as Order);
      } else {
        setOrder(null);
      }
      setLoading(false);
    }, (err) => {
      console.error('Failed to load order details for manager:', err);
      setLoading(false);
    });

    // Listen to items
    const unsubItems = onSnapshot(collection(db, 'orders', orderId, 'items'), (snapshot) => {
      setItems(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as OrderItem)));
    });

    // Fetch printers
    const fetchPrinters = async () => {
      try {
        const q = query(collection(db, 'profiles'), where('role', '==', 'PRINTER'), limit(50));
        const snap = await getDocs(q);
        setPrinters(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
      } catch (err) {
        console.error('Failed to fetch printers:', err);
      }
    };

    fetchPrinters();

    return () => {
      unsubOrder();
      unsubItems();
    };
  }, [orderId]);

  const handleReturnRedirect = () => {
    const returnTo = searchParams.get('returnTo') || '/admin/orders';
    try {
      const url = new URL(returnTo, window.location.origin);
      if (orderId) {
        if (url.pathname.includes('/orders')) {
          url.searchParams.set('highlight', orderId);
        } else {
          url.searchParams.set('orderId', orderId);
        }
      }
      router.push(url.pathname + url.search);
    } catch (e) {
      router.push(returnTo);
    }
  };

  const handleAssign = async (printerId: string) => {
    if (!order || !printerId) return;
    setProcessingId(order.id);
    try {
      await assignPrinter(order.id, printerId);
      toast.success('Printer assigned successfully.');
      handleReturnRedirect();
    } catch (error) {
      console.error('Assignment failed:', error);
      toast.error('Assignment failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleWorkDone = async () => {
    if (!order) return;
    setWorkDoneLoading(true);
    try {
      const result = await advanceOrderWorkflow(order.id, 'Manager marked work as done');
      const nextLabel = (result as any)?.currentStepLabel || (result as any)?.nextStepRole;
      if ((result as any)?.isFinished) {
        toast.success('Order fully completed! All stages done.', { duration: 5000 });
      } else {
        toast.success(
          nextLabel
            ? `Stage complete ✓ — Order moved to: ${nextLabel}`
            : 'Stage complete ✓ — Order advanced to next stage',
          { duration: 5000 }
        );
      }
      setConfirmWorkDone(false);
      handleReturnRedirect();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to advance order stage.');
      console.error('Work done failed:', error);
    } finally {
      setWorkDoneLoading(false);
    }
  };

  const validateTiffPathForItem = (key: string, tiffPath: string) => {
    const sanitizePath = (p: string) => {
      if (!p) return '';
      let s = p.trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      return s;
    };

    const trimmed = sanitizePath(tiffPath);

    if (!trimmed) {
      setTiffErrors(prev => ({ ...prev, [key]: '' }));
      return true;
    }

    if (!isValidTiffPath(trimmed)) {
      setTiffErrors(prev => ({ ...prev, [key]: 'Only shared network paths (starting with \\\\ or file:///) with a valid file extension (e.g. .png, .jpg, .pdf) are allowed.' }));
      return false;
    }

    if ((tiffDrafts[key] ?? '') !== trimmed) {
      setTiffDrafts(prev => ({ ...prev, [key]: trimmed }));
    }

    setTiffErrors(prev => ({ ...prev, [key]: '' }));
    return true;
  };

  const handleSelectPathPrompt = (itemId: string) => {
    const key = `${orderId}:${itemId}`;
    const current = tiffDrafts[key] ?? '';
    const value = window.prompt('Paste or type the file path (e.g. \\\\SERVER\\share\\file.jpg):', current || '');
    if (value === null) return; // Cancelled
    const trimmed = value.trim();
    setTiffDrafts(prev => ({ ...prev, [key]: trimmed }));
    toast.success('Path set. Click Save Path to store.');
  };

  const handleOpenTiffForItem = async (key: string, tiffPath: string) => {
    const sanitizePath = (p: string) => {
      if (!p) return '';
      let s = p.trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      return s;
    };

    const sanitized = sanitizePath(tiffPath);
    if (!validateTiffPathForItem(key, sanitized)) return;

    toast.loading('Opening file natively in system...', { id: key });
    const openedNatively = await openTiffInSystem(sanitized);

    if (openedNatively) {
      toast.success('File opened directly in your default system viewer!', { id: key });
    } else {
      toast.success('Bypassing browser safety - opening file URL...', { id: key });
      const fileUrl = normalizeTiffPathToFileUrl(sanitized);
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSaveItemPath = async (itemId: string, path: string) => {
    if (!order) return;
    const key = `${order.id}:${itemId}`;
    const sanitized = path.trim();

    if (!validateTiffPathForItem(key, sanitized)) return;

    setProcessingItemKey(key);
    try {
      const result = await assignItemTiffToPrinter(order.id, itemId, sanitized);
      toast.success('File path saved successfully ✓');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save path for this item.');
      console.error('Save item path failed:', error);
    } finally {
      setProcessingItemKey(null);
    }
  };

  const itemKey = (itemId: string) => `${orderId}:${itemId}`;

  const managerItems = useMemo(() => {
    if (!order) return [];

    const printWorkflow = resolvePrintWorkflow(order);
    const rawCustomerDesignFiles = Array.isArray(order.workflow?.customerDesignFiles)
      ? order.workflow.customerDesignFiles
      : [];
    const designItems = rawCustomerDesignFiles
      .flatMap((entry: any) => (Array.isArray(entry?.items) ? entry.items : [entry]))
      .map((item: any) => ({
        itemId: item?.itemId || item?.id || '',
        productName: item?.productName || 'Artwork',
        url: item?.url || '',
        fileName: item?.fileName || getFileNameFromPath(item?.url || ''),
      }))
      .filter((item: any) => item.url || item.productName);

    const fallbackDesignRef = order.workflow?.customerDesignUrl || order.thumbnailUrl || '';
    const displayDesignItems = (designItems.length > 0
      ? designItems
      : (fallbackDesignRef
        ? [{ itemId: 'legacy', productName: 'Design Reference', url: fallbackDesignRef, fileName: getFileNameFromPath(fallbackDesignRef) }]
        : [])).map((item: any) => {
          const assignment = printWorkflow?.itemAssignments?.find((a: any) => a.itemId === item.itemId);
          return {
            ...item,
            tiffPath: assignment?.tiffPath || '',
            assignedPrinterId: assignment?.printerId || '',
            assignedPrinterName: assignment?.printerName || ''
          };
        });

    const sourceItems = items.length > 0 ? items : (order.items || []);
    const displayOrderItems = sourceItems.map((item, index) => {
      const designUrl = item.itemWorkspace?.designerUploadUrl || item.designUrl || item.itemWorkspace?.customerUploadUrl || item.fileUrl || order?.workflow?.designUrl || order?.workflow?.customerDesignUrl || '';
      const itemId = item.id || `item-${index + 1}`;
      const assignment = printWorkflow?.itemAssignments?.find((a: any) => a.itemId === itemId);
      return {
        itemId,
        productName: item.productName || `Item ${index + 1}`,
        url: designUrl,
        fileName: getFileNameFromPath(designUrl),
        tiffPath: item.tiffPath || assignment?.tiffPath || '',
        assignedPrinterId: item.assignedPrinterId || assignment?.printerId || '',
        assignedPrinterName: item.assignedPrinterName || assignment?.printerName || '',
        customerOriginalUrl: item.itemWorkspace?.customerUploadUrl || item.fileUrl || order?.workflow?.customerDesignUrl || order?.thumbnailUrl || '',
        correctedArtworkUrl: item.itemWorkspace?.designerUploadUrl || (item.designUrl && item.designUrl !== item.fileUrl ? item.designUrl : '') || '',
      };
    });

    return displayOrderItems.length > 0
      ? displayOrderItems
      : displayDesignItems.length > 0
        ? displayDesignItems
        : (fallbackDesignRef
          ? [{ itemId: 'legacy', productName: 'Design Reference', url: fallbackDesignRef, fileName: getFileNameFromPath(fallbackDesignRef) }]
          : []);
  }, [order, items]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="mx-auto animate-spin text-indigo-600" size={40} />
          <p className="text-[13px] font-black uppercase tracking-[0.4em] text-indigo-600/40">Loading manager workspace...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
        <div className="max-w-md space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <ShieldCheck size={28} />
          </div>
          <div className="space-y-2">
            <h1 className="text-[28px] font-bold font-black tracking-tight text-slate-900">Order Not Available</h1>
            <p className="text-sm text-slate-500">This order could not be loaded or doesn't exist.</p>
          </div>
          <button 
            onClick={handleReturnRedirect} 
            className="rounded-lg bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-indigo-700"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const printWorkflow = resolvePrintWorkflow(order);
  const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? -1];
  const mode = getWorkspaceMode('MANAGER', order.workflowSnapshot);

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
      {/* Header Panel */}
      <section className="w-full">
        <div className="px-5 py-4 flex flex-row items-center justify-between gap-4 flex-wrap md:flex-nowrap">
          <div className="flex flex-row items-center gap-3 min-w-0">
            <span className="p-2 bg-indigo-100/80 text-indigo-700 rounded-xl shrink-0 hidden sm:inline-flex">
              <ShieldCheck size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[18px] md:text-[20px] font-black tracking-tight text-slate-900 truncate">
                  Order #{order.id.replace('ORD-', '')} — {order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Unknown Customer'}
                </h1>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center rounded-full border border-slate-200/50 bg-slate-50/50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-600">
                    {order.status}
                  </span>
                  {order.currentWorkflowLabel && (
                    <span className="inline-flex items-center rounded-full border border-indigo-200/50 bg-indigo-50/50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-700">
                      Role: {order.currentWorkflowLabel}
                    </span>
                  )}
                  {order.printerCategory && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">
                      <Printer size={11} /> {order.printerCategory}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Placed on {order.createdAt ? new Date((order.createdAt as any).seconds ? (order.createdAt as any).seconds * 1000 : order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button 
              onClick={handleReturnRedirect} 
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/60 bg-white/80 backdrop-blur-md px-4 h-9 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-white hover:shadow transition-all duration-200"
            >
              <ChevronLeft size={12} /> Back
            </button>
            {order.printerCategory && (
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-50 px-3 py-1.5">
                <Printer size={12} className="text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-amber-800 truncate leading-none">{order.printerCategory}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {mode === 'READ_ONLY' && (
        <div className="rounded-2xl bg-blue-50/60 p-4 flex items-start gap-3 border border-blue-100">
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

      {/* 🚀 Work Done Action */}
      {mode === 'READ_ONLY' ? (
        <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 opacity-75">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Manager Action</p>
            <h3 className="text-sm font-black text-slate-900">Mark Stage as Work Done</h3>
            <div className="text-[11px] text-slate-500 font-medium">
              This stage has already been completed.
            </div>
          </div>
          <button
            disabled
            className="inline-flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-not-allowed shadow-none"
          >
            <CheckCircle size={13} className="text-slate-400" />
            Already Completed
          </button>
        </div>
      ) : (() => {
        const snapshot = order.workflowSnapshot;
        const stepIdx = snapshot?.currentStepIndex ?? -1;
        const totalSteps = snapshot?.steps?.length ?? 0;
        const nextStep = snapshot?.steps?.[stepIdx + 1];
        const isLastStep = stepIdx >= totalSteps - 1;
        const hasMissingPaths = managerItems.some((item: any) => !item.tiffPath);
        const isActionDisabled = workDoneLoading || hasMissingPaths;

        return (
          <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Manager Action</p>
              <h3 className="text-sm font-black text-slate-900">
                {confirmWorkDone ? 'Confirm: Mark this stage as Work Done?' : 'Mark Stage as Work Done'}
              </h3>
              <div className="text-[11px] text-slate-500">
                {hasMissingPaths ? (
                  <span className="text-amber-600 font-medium flex items-center gap-1.5 mt-1">
                    <AlertTriangle size={12} /> Please save production file paths for all items before continuing.
                  </span>
                ) : isLastStep
                  ? 'This is the final stage — order will be fully completed.'
                  : nextStep
                    ? <>Advancing to next stage: <strong className="text-indigo-600">{nextStep.label || nextStep.role}</strong></>
                    : 'Advances the order to the next workflow stage.'}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {confirmWorkDone && (
                <button
                  onClick={() => setConfirmWorkDone(false)}
                  disabled={workDoneLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white/80 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white disabled:opacity-40 transition-all shadow-sm"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={confirmWorkDone ? handleWorkDone : () => setConfirmWorkDone(true)}
                disabled={isActionDisabled}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {workDoneLoading ? (
                  <><Loader2 size={13} className="animate-spin" /> Processing...</>
                ) : confirmWorkDone ? (
                  <><CheckCircle size={13} className="text-emerald-400" /> Yes, Confirm</>
                ) : (
                  <><ArrowRight size={13} /> Work Done</>
                )}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Full Booking Details (OrderDetailsPanel at top) */}
      <OrderDetailsPanel 
        order={order} 
        role="MANAGER" 
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

      {/* Main Assignment Panel */}
      <section className="w-full pt-4 border-t border-slate-200/60 space-y-4">
        <div className="flex items-center gap-2 pb-2">
          <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Printer size={16} />
          </span>
          <div>
            <h4 className="text-xs font-black text-slate-900 tracking-tight uppercase">Item Production Routing</h4>
            <p className="text-[10px] text-slate-500 font-medium italic mt-0.5">Assign printer and save network print file paths</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white/80 shadow-sm overflow-hidden text-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 font-medium">Item Info</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 font-medium">Network File Path</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest text-slate-500 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managerItems.map((item: any, index: number) => {
                  const key = itemKey(item.itemId || `item-${index + 1}`);
                  const currentPath = tiffDrafts[key] ?? item.tiffPath ?? '';
                  const isAlreadyAssigned = Boolean(item.assignedPrinterId && item.assignedPrinterName);

                  return (
                    <tr key={key} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-3 align-top w-[25%] min-w-[150px]">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item {index + 1}</span>
                          <span className="text-[12px] font-bold text-slate-900 mt-0.5 leading-tight">{item.productName || 'Print Item'}</span>
                          {item.url && (
                            <div className="mt-2 relative w-16 h-16 rounded-xl border border-slate-200/80 bg-slate-100 overflow-hidden flex items-center justify-center group shrink-0 shadow-sm">
                              {(/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(item.url) || (item.url.includes('cloudinary') && !item.url.toLowerCase().includes('.pdf'))) ? (
                                <img src={item.url} alt={item.productName} className="w-full h-full object-contain" />
                              ) : (
                                <div className="text-[8px] font-bold text-slate-500 text-center uppercase p-1">File</div>
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <a href={item.url} target="_blank" rel="noreferrer" className="text-[9px] font-black uppercase text-cyan-400 hover:underline">Open</a>
                              </div>
                            </div>
                          )}
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-cyan-600 hover:text-cyan-500 mt-1 font-bold">
                              <ExternalLink size={10} /> Preview
                            </a>
                          )}
                          {isAlreadyAssigned && (
                            <span className="mt-1.5 inline-flex items-center gap-1 w-max rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-700">
                              <CheckCircle size={8} /> {item.assignedPrinterName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 align-top">
                        <input 
                          type="text"
                          value={currentPath}
                          onChange={(e) => setTiffDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={mode === 'READ_ONLY' ? 'No path assigned' : '\\\\SERVER\\share\\file.jpg'}
                          disabled={mode === 'READ_ONLY'}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400 transition-all shadow-sm disabled:bg-slate-100/50 disabled:text-slate-500 disabled:cursor-not-allowed"
                        />
                        {tiffErrors[key] && (
                          <p className="text-[9px] font-bold text-rose-500 mt-1">{tiffErrors[key]}</p>
                        )}
                      </td>
                      <td className="p-3 align-top w-[20%] min-w-[160px]">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSelectPathPrompt(item.itemId || `item-${index + 1}`)}
                            disabled={mode === 'READ_ONLY'}
                            className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 shadow-sm ${
                              mode === 'READ_ONLY'
                                ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                            }`}
                            title={mode === 'READ_ONLY' ? 'Disabled - Completed Stage' : 'Prompt to paste path'}
                          >
                            <LayoutGrid size={10} /> Paste
                          </button>
                          {currentPath.trim() && isValidTiffPath(currentPath.trim()) && (
                            <button
                              onClick={() => handleOpenTiffForItem(key, currentPath)}
                              className="px-3 py-1.5 rounded-full bg-cyan-50 border border-cyan-100 hover:bg-cyan-100 text-[9px] font-black uppercase tracking-widest text-cyan-700 transition-all flex items-center gap-1 shadow-sm"
                              title="Open File"
                            >
                              <ExternalLink size={10} /> Open
                            </button>
                          )}
                          <button
                            disabled={
                              mode === 'READ_ONLY' ||
                              processingItemKey === key ||
                              (currentPath.trim() && !isValidTiffPath(currentPath.trim())) ||
                              (item.tiffPath === currentPath.trim())
                            }
                            onClick={() => handleSaveItemPath(item.itemId || `item-${index + 1}`, currentPath)}
                            className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-md ${
                              mode === 'READ_ONLY'
                                ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60 shadow-none'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/10'
                            }`}
                            title={mode === 'READ_ONLY' ? 'Disabled - Completed Stage' : 'Save production path'}
                          >
                            {mode === 'READ_ONLY' ? 'Save' : processingItemKey === key ? 'Saving' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Timeline */}
      {currentStep && (
        <div className="w-full pt-4 border-t border-slate-200/60 space-y-3">
          <h4 className="text-[12px] font-black text-slate-800 tracking-tight uppercase">Timeline</h4>
          <div className="space-y-3">
            {printWorkflow?.timeline?.length ? (
              printWorkflow.timeline.map((entry: any, index: number) => (
                <div key={index} className="flex gap-2 text-[11px]">
                  <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                  <div>
                    <p className="font-bold text-slate-800 uppercase text-[9px] tracking-wider">{entry.event.replace('_', ' ')}</p>
                    <p className="text-slate-600 mt-0.5 font-medium">{entry.notes}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">By {entry.user || 'SYSTEM'}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-400 italic">No timeline entries yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Visual Artwork Previews */}
      <div className="w-full pt-4 border-t border-slate-200/60 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Palette size={16} />
          </span>
          <div>
            <h4 className="text-xs font-black text-slate-900 tracking-tight uppercase">Visual Artwork Previews</h4>
            <p className="text-[10px] text-slate-500 font-medium italic mt-0.5">Verify the final design layout before sending to production</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {managerItems.map((item: any, index: number) => {
            const customerOriginalUrl = item.customerOriginalUrl || '';
            const correctedArtworkUrl = item.correctedArtworkUrl || '';
            const hasCorrected = !!correctedArtworkUrl && !!customerOriginalUrl && correctedArtworkUrl !== customerOriginalUrl;

            const isPdf = item.url ? item.url.toLowerCase().includes('.pdf') : false;
            const isImage = item.url ? (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(item.url) || (item.url.includes('cloudinary') && !isPdf)) : false;

            return (
              <div key={item.itemId || index} className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 space-y-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Item {index + 1}</span>
                    <h5 className="text-sm font-black text-slate-900 mt-0.5">{item.productName}</h5>
                  </div>
                  {hasCorrected ? (
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full shrink-0">
                      Corrected Design
                    </span>
                  ) : (
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full shrink-0">
                      Approved Design
                    </span>
                  )}
                </div>

                {hasCorrected ? (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Left: Original */}
                    <div className="space-y-1">
                      <span className="text-[8px] font-black uppercase text-amber-800 tracking-wider block">Original Upload</span>
                      <div className="h-28 rounded-xl border border-slate-200 bg-white overflow-hidden relative group flex items-center justify-center shadow-sm">
                        {/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(customerOriginalUrl) || customerOriginalUrl.includes('cloudinary') ? (
                          <>
                            <img src={customerOriginalUrl} alt="Original" className="h-full w-full object-contain" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <a href={customerOriginalUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <ExternalLink size={10} /> View
                              </a>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-2 text-[10px] text-slate-400 font-medium">Original file</div>
                        )}
                      </div>
                    </div>
                    {/* Right: Corrected */}
                    <div className="space-y-1">
                      <span className="text-[8px] font-black uppercase text-emerald-800 tracking-wider block">Corrected Design</span>
                      <div className="h-28 rounded-xl border-2 border-emerald-300 bg-white overflow-hidden relative group flex items-center justify-center shadow-sm">
                        {/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(correctedArtworkUrl) || correctedArtworkUrl.includes('cloudinary') ? (
                          <>
                            <img src={correctedArtworkUrl} alt="Corrected" className="h-full w-full object-contain" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <a href={correctedArtworkUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <ExternalLink size={10} /> View
                              </a>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-2 text-[10px] text-slate-400 font-medium">Corrected file</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Single Preview */
                  <div className="h-28 rounded-xl border border-slate-200 bg-white overflow-hidden relative group flex items-center justify-center shadow-sm">
                    {isImage ? (
                      <>
                        <img src={item.url} alt="Artwork preview" className="h-full w-full object-contain" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <ExternalLink size={10} /> View
                          </a>
                        </div>
                      </>
                    ) : isPdf ? (
                      <div className="w-full h-full relative">
                        <iframe src={`${item.url}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <ExternalLink size={10} /> Open PDF
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-3">
                        <p className="text-[10px] text-slate-400 font-medium">No Image preview available</p>
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-blue-500 hover:underline mt-1 inline-block">
                            Open Attached File
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
