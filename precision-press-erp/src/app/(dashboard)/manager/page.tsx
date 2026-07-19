'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Users, 
  Printer, 
  Activity,
  ClipboardList,
  Loader2,
  CheckCircle,
  UserPlus,
  LockKeyhole,
  LayoutGrid,
  ShieldCheck,
  Copy,
  ExternalLink,
  FileType,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { StaffRole } from '@/types/roles';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  getDocs,
  limit
} from '@/lib/supabase-firestore-shim';
import { Order, UserProfile } from '@/types/models';
import { assignPrinter, assignTiffToPrinter, assignItemTiffToPrinter } from '@/lib/workflow';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowTaskQueue } from '@/components/production/WorkflowTaskQueue';
import { WorkflowAttachments } from '@/components/production/WorkflowAttachments';
import { getFileNameFromPath, inspectTiffPath, isValidTiffPath, normalizeTiffPathToFileUrl, resolvePrintWorkflow, openTiffInSystem } from '@/lib/tiff-utils';
import { toast } from 'react-hot-toast';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';

export const dynamic = 'force-dynamic';

export default function ManagerDashboard() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewFromQuery = searchParams.get('view');
  const queryString = searchParams.toString();
  const view = pathname.endsWith('/assigned')
    ? 'assigned'
    : pathname.endsWith('/unassigned')
      ? 'unassigned'
      : viewFromQuery;
  const highlightOrderId = searchParams.get('orderId');
  const isOrderFocusedView = Boolean(highlightOrderId) || /(?:^|&)orderid=/i.test(queryString);
  
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [activeJobs, setActiveJobs] = useState<Order[]>([]);
  const [printers, setPrinters] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeJobsScope, setActiveJobsScope] = useState<'mine' | 'all'>('all');
  const [tiffDrafts, setTiffDrafts] = useState<Record<string, string>>({});
  const [tiffErrors, setTiffErrors] = useState<Record<string, string>>({});
  const [selectedItemPrinters, setSelectedItemPrinters] = useState<Record<string, string>>({});
  const [processingItemKey, setProcessingItemKey] = useState<string | null>(null);
  const [selectedLocalTiffs, setSelectedLocalTiffs] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!user) return;

    // 1. Listen for orders needing assignment (Dynamic Workflow: MANAGER role)
    const qPending = query(
      collection(db, 'orders'),
      where('currentWorkflowRole', '==', 'MANAGER'),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );

    const unsubPending = onSnapshot(qPending, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      setPendingOrders(orders);
    }, (error) => {
      console.error('Pending orders listener failed:', error);
    });

    // 2. Listen for active production
    const qActive = query(
      collection(db, 'orders'),
      where('status', 'in', ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED']),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubActive = onSnapshot(qActive, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      setActiveJobs(orders);
      setLoading(false);
    }, (error) => {
      console.error('Active jobs listener failed:', error);
      setLoading(false);
    });

    // 3. Fetch Printers
    const fetchPrinters = async () => {
      const q = query(collection(db, 'profiles'), where('role', '==', 'PRINTER'), limit(50));
      const snap = await getDocs(q);
      setPrinters(snap.docs.map((d) => {
        const data = d.data() as UserProfile;
        const { uid, ...profile } = data;
        return { uid: d.id, ...profile };
      }));
    };

    fetchPrinters();

    return () => {
      unsubPending();
      unsubActive();
    };
  }, [user]);

  const handleAssign = async (orderId: string, printerId: string) => {
    if (!user || !printerId) return;
    setProcessingId(orderId);
    try {
      await assignPrinter(orderId, printerId);
    } catch (error) {
      console.error('Assignment failed:', error);
      alert('Assignment failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const validateTiffPathForOrder = (orderId: string, tiffPath: string) => {
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
      setTiffErrors(prev => ({ ...prev, [orderId]: 'Paste a TIFF network path first.' }));
      return false;
    }

    if (!isValidTiffPath(trimmed)) {
      setTiffErrors(prev => ({ ...prev, [orderId]: 'Only shared network paths (starting with \\\\ or file:///) with a valid file extension are allowed.' }));
      return false;
    }

    if ((tiffDrafts[orderId] ?? '') !== trimmed) {
      setTiffDrafts(prev => ({ ...prev, [orderId]: trimmed }));
    }

    setTiffErrors(prev => ({ ...prev, [orderId]: '' }));
    return true;
  };

  const handleOpenTiffForOrder = async (orderId: string, tiffPath: string) => {
    const sanitizePath = (p: string) => {
      if (!p) return '';
      let s = p.trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      return s;
    };

    const sanitized = sanitizePath(tiffPath);
    if (!validateTiffPathForOrder(orderId, sanitized)) return;

    toast.loading('Opening TIFF natively in system...', { id: `${orderId}-order` });
    const openedNatively = await openTiffInSystem(sanitized);

    if (openedNatively) {
      toast.success('TIFF opened directly in your default system viewer!', { id: `${orderId}-order` });
    } else {
      toast.success('Bypassing browser safety - opening file URL...', { id: `${orderId}-order` });
      const fileUrl = normalizeTiffPathToFileUrl(sanitized);
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSendTiff = async (orderId: string, tiffPath: string) => {
    const sanitizePath = (p: string) => {
      if (!p) return '';
      let s = p.trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      return s;
    };

    const sanitized = sanitizePath(tiffPath);
    if (!validateTiffPathForOrder(orderId, sanitized)) return;

    setProcessingId(orderId);
    try {
      await assignTiffToPrinter(orderId, sanitized);
      toast.success('TIFF assigned to printer queue.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to assign TIFF to printer.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleLocalTiffPick = (orderId: string, file: File | null) => {
    if (!file) return;

    const fileName = file.name.trim();

    setSelectedLocalTiffs(prev => ({ ...prev, [orderId]: fileName }));
    toast.success(`Selected local TIFF file: ${fileName}`);
  };

  const itemKey = (orderId: string, itemId: string) => `${orderId}:${itemId}`;

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
      setTiffErrors(prev => ({ ...prev, [key]: 'Paste a TIFF network path first.' }));
      return false;
    }

    if (!isValidTiffPath(trimmed)) {
      setTiffErrors(prev => ({ ...prev, [key]: 'Only shared network paths (starting with \\\\ or file:///) with a valid file extension are allowed.' }));
      return false;
    }

    if ((tiffDrafts[key] ?? '') !== trimmed) {
      setTiffDrafts(prev => ({ ...prev, [key]: trimmed }));
    }

    setTiffErrors(prev => ({ ...prev, [key]: '' }));
    return true;
  };

  const handleSelectPathPrompt = (orderId: string, itemId: string) => {
    const key = itemKey(orderId, itemId);
    const current = tiffDrafts[key] ?? '';
    const value = window.prompt('Paste or type the TIFF path (e.g. \\SERVER\\share\\file.tiff or file:///C:/path/file.tiff):', current || '');
    if (!value) return;
    const trimmed = value.trim();
    setTiffDrafts(prev => ({ ...prev, [key]: trimmed }));
    setSelectedLocalTiffs(prev => ({ ...prev, [key]: trimmed }));
    toast.success('Path set. Validate before sending.');
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

    toast.loading('Opening TIFF natively in system...', { id: key });
    const openedNatively = await openTiffInSystem(sanitized);

    if (openedNatively) {
      toast.success('TIFF opened directly in your default system viewer!', { id: key });
    } else {
      toast.success('Bypassing browser safety - opening file URL...', { id: key });
      const fileUrl = normalizeTiffPathToFileUrl(sanitized);
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSendItemTiff = async (orderId: string, itemId: string, tiffPath: string, printerId: string) => {
    const key = itemKey(orderId, itemId);
    const sanitized = tiffPath.trim();
    if (!printerId) {
      toast.error('Please select a printer for this item first.');
      return;
    }

    if (!validateTiffPathForItem(key, sanitized)) return;

    setProcessingItemKey(key);
    try {
      await assignItemTiffToPrinter(orderId, itemId, sanitized, printerId);
      toast.success('TIFF path saved and item assigned to printer.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to assign TIFF for this item.');
      console.error('Send item TIFF failed:', error);
    } finally {
      setProcessingItemKey(null);
    }
  };

  const handlePrinterSelect = (orderId: string, itemId: string, printerId: string) => {
    const key = itemKey(orderId, itemId);
    setSelectedItemPrinters(prev => ({ ...prev, [key]: printerId }));
  };

  const STATS = [
    { label: 'Orders Awaiting Review', value: pendingOrders.length, icon: ClipboardList, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Manager Active Jobs', value: activeJobs.filter(j => j.status !== 'COMPLETED').length, icon: Printer, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Ready for Dispatch', value: activeJobs.filter(j => j.status === 'COMPLETED').length, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Assigned Floor Staff', value: printers.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <RoleGuard allowedRoles={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-4 animate-in fade-in duration-500">
        <StaffRoleSwitcher userRoles={(profile?.roles as StaffRole[]) || []} />
        
        {/* Compact Header */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-3 rounded border border-slate-200 -mt-6">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-900 rounded text-white shadow-sm">
                 <ShieldCheck size={18} />
              </div>
              <div>
                 <h1 className="text-sm font-black text-slate-900 uppercase tracking-wider">Manager Control Tower</h1>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight opacity-70">Production scheduling, live oversight, and floor assignment</p>
              </div>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="text-right border-r border-slate-200 pr-3">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-0.5">Live Feed Sync</p>
                 <p className="text-[10px] font-bold text-slate-900 leading-none">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="p-1.5 hover:bg-slate-100 rounded border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all active:scale-95 shadow-sm"
              >
                 <Activity size={14} />
              </button>
           </div>
        </section>
  
        {/* High Density Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {STATS.map((stat, i) => (
            <div key={i} className="bg-white p-3 rounded border border-slate-200 flex items-center gap-3 shadow-sm hover:border-slate-400 transition-all cursor-default">
              <div className={`p-2 rounded ${stat.bg} ${stat.color} shadow-sm`}>
                <stat.icon size={14} strokeWidth={2.5} />
              </div>
              <div className="leading-none">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">{stat.value}</h3>
              </div>
            </div>
          ))}
        </div>
  
        <div className={`grid grid-cols-1 ${!view ? 'lg:grid-cols-2' : ''} gap-4`}>
          {/* Assignment Queue */}
          {(!view || view === 'unassigned') && (
            <div className={isOrderFocusedView ? 'lg:col-span-2' : ''}>
              <WorkflowTaskQueue 
              title="Orders Awaiting Review"
              icon={<UserPlus size={20} className="text-rose-500" />}
              role="MANAGER"
              highlightOrderId={highlightOrderId}
              emptyMessage="No orders waiting for manager review."
              renderActions={(order, isProcessing) => (
                <div className="flex-1 relative">
                  <select 
                    disabled={isProcessing || processingId === order.id}
                    onChange={(e) => handleAssign(order.id, e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider outline-none focus:border-indigo-500 appearance-none cursor-pointer pr-8"
                  >
                    <option value="">Assign to floor staff...</option>
                    {printers.map(p => (
                      <option key={p.uid} value={p.uid}>{p.displayName || p.name}</option>
                    ))}
                  </select>
                  <UserPlus size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              )}
              renderExpanded={(order) => {
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
                const displayDesignItems = designItems.length > 0
                  ? designItems
                  : (fallbackDesignRef
                    ? [{ itemId: 'legacy', productName: 'Design Reference', url: fallbackDesignRef, fileName: getFileNameFromPath(fallbackDesignRef) }]
                    : []);

                const displayOrderItems = order.items?.map((item, index) => ({
                  itemId: item.id || `item-${index + 1}`,
                  productName: item.productName || `Item ${index + 1}`,
                  url: item.designUrl || item.fileUrl || '',
                  fileName: getFileNameFromPath(item.designUrl || item.fileUrl || ''),
                  tiffPath: item.tiffPath ?? '',
                  assignedPrinterId: item.assignedPrinterId ?? '',
                  assignedPrinterName: item.assignedPrinterName ?? '',
                })) || [];

                const managerItems = displayOrderItems.length > 0
                  ? displayOrderItems
                  : displayDesignItems.length > 0
                    ? displayDesignItems
                    : (fallbackDesignRef
                      ? [{ itemId: 'legacy', productName: 'Design Reference', url: fallbackDesignRef, fileName: getFileNameFromPath(fallbackDesignRef) }]
                      : []);

                return (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Client Design Reference</p>
                          {displayDesignItems.length > 0 ? (
                            <div className="space-y-1.5">
                              {displayDesignItems.map((item: any, index: number) => (
                                <div key={`${item.itemId || item.fileName || 'design'}-${index}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Item {index + 1}</p>
                                  <p className="text-xs font-bold text-slate-900 break-all mt-0.5">{item.productName}</p>
                                  {item.url ? (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] font-medium text-indigo-600 break-all hover:underline"
                                    >
                                      {item.fileName || item.url}
                                    </a>
                                  ) : (
                                    <p className="text-[11px] font-medium text-slate-500">No file link</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm font-medium text-slate-700 break-all">No design attachment found</p>
                          )}
                        </div>
                        <div className="w-1/3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Production TIFF Path</p>
                          <input
                            type="text"
                            value={tiffDrafts[order.id] ?? printWorkflow?.tiffPath ?? ''}
                            onChange={(e) => setTiffDrafts(prev => ({ ...prev, [order.id]: e.target.value }))}
                            placeholder="\\SERVER\PRESS_JOBS\ORD-1001\final-print.tiff"
                            className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs font-mono text-slate-700 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Customer</p>
                        <p className="text-sm font-bold text-slate-900">{order.customerSnapshot?.displayName || order.customerSnapshot?.name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Order Value</p>
                        <p className="text-sm font-bold text-slate-900">₹{order.amounts?.grandTotal?.toLocaleString()}</p>
                      </div>
                    </div>

                    {Array.isArray(printWorkflow?.timeline) && printWorkflow.timeline.filter((entry: any) => entry.event !== 'TIFF_ASSIGNED').length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">TIFF Timeline</p>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{printWorkflow.timeline.filter((entry: any) => entry.event !== 'TIFF_ASSIGNED').length} events</span>
                        </div>
                        <div className="space-y-2">
                          {printWorkflow.timeline.filter((entry: any) => entry.event !== 'TIFF_ASSIGNED').map((entry: any, idx: number) => (
                            <div key={`${entry.event}-${idx}`} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                              <div className={`mt-0.5 w-2.5 h-2.5 rounded-full ${entry.event === 'PRINT_COMPLETED' ? 'bg-emerald-500' : entry.event === 'PRINT_STARTED' ? 'bg-indigo-500' : entry.event === 'TIFF_OPENED' ? 'bg-cyan-500' : 'bg-amber-500'}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">{entry.event.replace('_', ' ')}</p>
                                  <span className="text-[9px] font-bold text-slate-400">{entry.user || 'SYSTEM'}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 break-all">
                                  {typeof entry.timestamp === 'string'
                                    ? entry.timestamp
                                    : entry.timestamp?.seconds
                                      ? new Date(entry.timestamp.seconds * 1000).toLocaleString()
                                      : 'Timestamp pending'}
                                </p>
                                {entry.notes && <p className="text-[10px] text-slate-600 mt-1">{entry.notes}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    


                    <div className="mt-4 space-y-4">
                      <div className="p-4 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">Manager Production Panel</p>
                            <p className="text-xs font-medium text-white/70 mt-1">
                              Assign TIFF paths per item and send each item to its selected printer.
                            </p>
                          </div>
                          <div className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 text-[10px] font-black uppercase tracking-widest">
                            TIFF + Printer
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {managerItems.length > 0 ? managerItems.map((item: any, index: number) => {
                          const key = itemKey(order.id, item.itemId || `item-${index + 1}`);
                          const currentPath = tiffDrafts[key] ?? item.tiffPath ?? '';
                          const selectedPrinter = selectedItemPrinters[key] ?? item.assignedPrinterId ?? '';
                          const pathForAction = currentPath;
                          const isAlreadyAssigned = Boolean(item.assignedPrinterId && item.assignedPrinterName);
                          const isReassigning = isAlreadyAssigned && selectedPrinter && selectedPrinter !== item.assignedPrinterId;
                          const selectedPrinterName = printers.find((printer) => printer.uid === selectedPrinter)?.displayName || printers.find((printer) => printer.uid === selectedPrinter)?.name || '';
                          const currentAssignedPrinterLabel = item.assignedPrinterName || selectedPrinterName;

                          return (
                            <div key={`item-card-${key}`} className="rounded-2xl border border-slate-800 bg-slate-950/95 p-3">
                              {isAlreadyAssigned && (
                                <div className="mb-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-200">
                                  Assigned to printer {currentAssignedPrinterLabel}
                                </div>
                              )}
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-2">
                                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Item {index + 1}</p>
                                  <p className="text-sm font-bold text-white">{item.productName || 'Artwork'}</p>
                                  {item.url ? (
                                    <a href={item.url} target="_blank" rel="noreferrer" className="text-[11px] text-cyan-300 hover:underline break-all">
                                      {item.fileName || item.url}
                                    </a>
                                  ) : (
                                    <p className="text-[11px] text-slate-400">No design file available for this item.</p>
                                  )}
                                </div>
                                <div className="text-[10px] uppercase tracking-[0.35em] text-slate-400 self-start">
                                  {item.itemId ? `ID: ${item.itemId}` : 'Unknown Item'}
                                </div>
                              </div>

                              <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Production TIFF Path</label>
                                  <input
                                    type="text"
                                    value={currentPath}
                                    onChange={(e) => setTiffDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                                    placeholder="\\SERVER\PRESS_JOBS\ORD-1001\item-1.tiff"
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-white outline-none focus:border-cyan-400"
                                  />
                                  <p className="text-[10px] text-slate-400">
                                    Allowed: network path starting with <span className="text-cyan-300">\\</span> or <span className="text-cyan-300">file:///</span>
                                  </p>
                                  {tiffErrors[key] && (
                                    <p className="text-[11px] text-rose-300 font-medium">{tiffErrors[key]}</p>
                                  )}
                                </div>

                                {isValidTiffPath(pathForAction.trim()) && (
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Send to Printer</label>
                                    <select
                                      value={selectedPrinter}
                                      onChange={(e) => handlePrinterSelect(order.id, item.itemId || `item-${index + 1}`, e.target.value)}
                                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                                    >
                                      <option value="">Select printer...</option>
                                      {printers.map((printer) => (
                                        <option key={printer.uid} value={printer.uid}>{printer.displayName || printer.name || printer.uid}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => validateTiffPathForItem(key, pathForAction)}
                                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                  Validate TIFF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSelectPathPrompt(order.id, item.itemId || `item-${index + 1}`)}
                                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                                >
                                  <LayoutGrid size={12} />
                                  Select Path
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenTiffForItem(key, pathForAction)}
                                  className="px-3 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/20 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                                >
                                  <ExternalLink size={12} />
                                  Open TIFF
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    processingItemKey === key ||
                                    !pathForAction.trim() ||
                                    !isValidTiffPath(pathForAction.trim()) ||
                                    !selectedPrinter ||
                                    (isAlreadyAssigned && selectedPrinter === item.assignedPrinterId)
                                  }
                                  onClick={() => handleSendItemTiff(order.id, item.itemId || `item-${index + 1}`, pathForAction, selectedPrinter)}
                                  className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed border border-emerald-300 text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                  {processingItemKey === key ? 'Sending...' : isAlreadyAssigned ? 'Reassign Printer' : 'Send To Printer'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!pathForAction) return;
                                    const sanitized = pathForAction.trim().replace(/^['"]|['"]$/g, '');
                                    navigator.clipboard.writeText(sanitized);
                                    toast.success('TIFF path copied.');
                                  }}
                                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                                >
                                  <Copy size={12} />
                                  Copy Path
                                </button>
                              </div>
                              {item.assignedPrinterName && item.tiffPath && (
                                <p className="text-[10px] text-emerald-300 font-semibold mt-2">
                                  Assigned to printer {item.assignedPrinterName}
                                </p>
                              )}
                              {isAlreadyAssigned && selectedPrinter === item.assignedPrinterId && (
                                <p className="text-[10px] text-slate-400 font-medium mt-2">
                                  Already assigned. Choose another printer to reassign this item.
                                </p>
                              )}
                              {isAlreadyAssigned && isReassigning && selectedPrinterName && (
                                <p className="text-[10px] text-cyan-300 font-medium mt-1">
                                  Reassigning to {selectedPrinterName}
                                </p>
                              )}
                              {(!pathForAction.trim() || !isValidTiffPath(pathForAction.trim())) && (
                                <p className="text-[10px] text-rose-300 font-medium mt-1">Enter a valid TIFF path before assigning this item to a printer.</p>
                              )}
                              {pathForAction.trim() && isValidTiffPath(pathForAction.trim()) && !selectedPrinter && (
                                <p className="text-[10px] text-amber-300 font-medium mt-1">Select a printer to enable assignment.</p>
                              )}
                              {selectedPrinter && pathForAction.trim() && !isValidTiffPath(pathForAction.trim()) && (
                                <p className="text-[10px] text-rose-300 font-medium mt-1">File path must end with a valid extension (e.g. .png, .jpg, .pdf, .tiff) and use a network/file URL.</p>
                              )}
                            </div>
                          );
                        }) : (
                          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-slate-300">
                            No order items available for TIFF assignment.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }}
              />
            </div>
          )}
  
           {/* Active Production Tracking */}
           {(!view || view === 'assigned') && !isOrderFocusedView && (
            <section className="space-y-2">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveJobsScope('mine')}
                  className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider border transition-colors ${
                    activeJobsScope === 'mine'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  My Assigned Jobs
                </button>
                <button
                  type="button"
                  onClick={() => setActiveJobsScope('all')}
                  className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider border transition-colors ${
                    activeJobsScope === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Active Jobs
                </button>
              </div>

              <RoleActiveJobs
                role={profile?.role || 'MANAGER'}
                dataMode="manager-printer-assignments"
                assignmentScope={activeJobsScope}
                assignedByUserId={profile?.uid || user?.uid}
                staffProfiles={printers}
                title={activeJobsScope === 'all' ? 'All Active Jobs' : 'Manager Active Jobs'}
                subtitle={activeJobsScope === 'all'
                  ? 'All orders assigned to printers'
                  : 'Orders assigned to printers by this account'}
                emptyMessage={activeJobsScope === 'all'
                  ? 'No active printer-assigned orders.'
                  : 'No active jobs assigned by this account.'}
                maxHeight="600px"
              />
            </section>
           )}
        </div>

        {/* Administrative Command Utilities */}
        {(profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN') && (
          <section className="pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-3 px-1">
              <ShieldCheck className="text-slate-900" size={14} strokeWidth={2.5} />
              <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-wider">Command &amp; Control Manifest</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <Link 
                href="/admin/control" 
                className="group p-3 bg-white border border-slate-200 rounded flex items-center gap-3 hover:border-indigo-600 transition-all shadow-sm active:scale-95"
              >
                <div className="w-9 h-9 bg-indigo-50 rounded flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm border border-indigo-100">
                  <Activity size={16} />
                </div>
                <div>
                   <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Access Control</h4>
                   <p className="text-[9px] text-slate-400 font-bold uppercase">Impersonation Portal</p>
                </div>
              </Link>

              <Link 
                href="/manager/customers" 
                className="group p-3 bg-white border border-slate-200 rounded flex items-center gap-3 hover:border-emerald-600 transition-all shadow-sm active:scale-95"
              >
                <div className="w-9 h-9 bg-emerald-50 rounded flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm border border-emerald-100">
                  <Users size={16} />
                </div>
                <div>
                   <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Identity Vault</h4>
                   <p className="text-[9px] text-slate-400 font-bold uppercase">Provision Registry</p>
                </div>
              </Link>

              <div className="p-3 bg-slate-100 border border-slate-200 rounded flex items-center gap-3 opacity-60 cursor-not-allowed">
                <div className="w-9 h-9 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                  <LockKeyhole size={16} />
                </div>
                <div>
                   <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-tight">Audit Logs</h4>
                   <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Read Only Access</p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </RoleGuard>
  );
}


