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
  Palette,
  Eye
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
                      {order.status}
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
                onClick={handleReturnRedirect} 
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 backdrop-blur-md px-4 h-9 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-white hover:shadow-sm transition-all duration-200"
              >
                <ChevronLeft size={12} /> Back
              </button>
              {mode === 'READ_ONLY' ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/80 px-4 h-9 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-2xs">
                  <CheckCircle size={12} className="text-slate-400" /> Already Completed
                </div>
              ) : (
                <button
                  onClick={confirmWorkDone ? handleWorkDone : () => setConfirmWorkDone(true)}
                  disabled={workDoneLoading || managerItems.some((item: any) => !item.tiffPath)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white px-5 h-9 text-[10px] font-black uppercase tracking-widest transition-all shadow-md disabled:opacity-50"
                >
                  {workDoneLoading ? (
                    <><Loader2 size={12} className="animate-spin" /> Processing...</>
                  ) : confirmWorkDone ? (
                    <><CheckCircle size={12} className="text-emerald-400" /> Confirm Work Done</>
                  ) : (
                    <><ArrowRight size={12} /> Work Done</>
                  )}
                </button>
              )}
            </div>
          </div>
        </section>

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

        {/* Full Booking Details (OrderDetailsPanel at top with Customer, Logistics, Notes, Order Items & Payment) */}
        <OrderDetailsPanel 
          order={order} 
          role="MANAGER" 
          className="text-slate-800 w-full"
        />

        {/* Main Assignment Panel */}
        <section className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
            <span className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
              <Printer size={16} />
            </span>
            <div>
              <h4 className="text-xs font-black text-slate-900 tracking-tight uppercase">Item Production Routing</h4>
              <p className="text-[10px] text-slate-600 font-bold italic mt-0.5">Assign printer and save network print file paths</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-2xs overflow-hidden text-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70">
                    <th className="p-3 text-[11px] font-black uppercase tracking-widest text-slate-700">Item Info</th>
                    <th className="p-3 text-[11px] font-black uppercase tracking-widest text-slate-700">Network File Path</th>
                    <th className="p-3 text-[11px] font-black uppercase tracking-widest text-slate-700 text-right">Actions</th>
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
          <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-3">
            <h4 className="text-xs font-black text-slate-800 tracking-tight uppercase">Timeline</h4>
            <div className="space-y-3">
              {printWorkflow?.timeline?.length ? (
                printWorkflow.timeline.map((entry: any, index: number) => (
                  <div key={index} className="flex gap-2 text-xs font-medium">
                    <div className="mt-1 w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                    <div>
                      <p className="font-black text-slate-900 uppercase text-[10px] tracking-wider">{entry.event.replace('_', ' ')}</p>
                      <p className="text-slate-700 mt-0.5 font-bold">{entry.notes}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">By {entry.user || 'SYSTEM'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs font-bold text-slate-600 italic">No timeline entries yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Visual Artwork Previews */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
            <span className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
              <Palette size={16} />
            </span>
            <div>
              <h4 className="text-xs font-black text-slate-900 tracking-tight uppercase">Visual Artwork Previews</h4>
              <p className="text-[10px] text-slate-600 font-bold italic mt-0.5">Verify the final design layout before sending to production</p>
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
                <div key={item.itemId || index} className="rounded-2xl border border-white/80 bg-white/70 backdrop-blur-md p-4 space-y-3 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Item {index + 1}</span>
                      <h5 className="text-sm font-black text-slate-900 mt-0.5">{item.productName}</h5>
                    </div>
                    {hasCorrected ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full shrink-0 shadow-2xs">
                        Corrected Design
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-full shrink-0 shadow-2xs">
                        Approved Design
                      </span>
                    )}
                  </div>

                  {hasCorrected ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Left: Original */}
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase text-amber-800 tracking-wider block">Original Upload</span>
                        <div className="h-28 rounded-xl border border-slate-200 bg-white overflow-hidden relative group flex items-center justify-center shadow-2xs">
                          {/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(customerOriginalUrl) || customerOriginalUrl.includes('cloudinary') ? (
                            <>
                              <img src={customerOriginalUrl} alt="Original" className="h-full w-full object-contain" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <a href={customerOriginalUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                  <ExternalLink size={10} /> View
                                </a>
                              </div>
                            </>
                          ) : (
                            <div className="text-center p-2 text-xs text-slate-500 font-bold">Original file</div>
                          )}
                        </div>
                      </div>
                      {/* Right: Corrected */}
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase text-emerald-800 tracking-wider block">Corrected Design</span>
                        <div className="h-28 rounded-xl border-2 border-emerald-300 bg-white overflow-hidden relative group flex items-center justify-center shadow-2xs">
                          {/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(correctedArtworkUrl) || correctedArtworkUrl.includes('cloudinary') ? (
                            <>
                              <img src={correctedArtworkUrl} alt="Corrected" className="h-full w-full object-contain" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <a href={correctedArtworkUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                  <ExternalLink size={10} /> View
                                </a>
                              </div>
                            </>
                          ) : (
                            <div className="text-center p-2 text-xs text-slate-500 font-bold">Corrected file</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Single Preview */
                    <div className="h-28 rounded-xl border border-slate-200 bg-white overflow-hidden relative group flex items-center justify-center shadow-2xs">
                      {isImage ? (
                        <>
                          <img src={item.url} alt="Artwork preview" className="h-full w-full object-contain" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                              <ExternalLink size={10} /> View
                            </a>
                          </div>
                        </>
                      ) : isPdf ? (
                        <div className="w-full h-full relative">
                          <iframe src={`${item.url}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                              <ExternalLink size={10} /> Open PDF
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-3">
                          <p className="text-xs text-slate-500 font-bold">No Image preview available</p>
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-blue-600 hover:underline mt-1 inline-block">
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
