'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
export const dynamic = 'force-dynamic';

import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Printer, 
  Play, 
  CheckCircle, 
  Timer,
  Info,
  ClipboardList,
  ArrowRight,
  Loader2,
  Pause,
  LayoutGrid,
  ExternalLink,
  Copy,
  FileType,
} from 'lucide-react';
import { WorkflowTaskQueue } from '@/components/production/WorkflowTaskQueue';
import { PrinterOrderWorkspace } from '@/components/orders/PrinterOrderWorkspace';
import { RoleUnassignedBacklog } from '@/components/dashboard/RoleUnassignedBacklog';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { StaffRole } from '@/types/roles';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  limit 
} from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import { markTiffOpened, startTiffPrint, completeTiffPrint, pauseJob, resumeJob } from '@/lib/workflow';
import { STATUS_LABELS, STATUS_COLORS } from '@/types/workflow';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowAttachments } from '@/components/production/WorkflowAttachments';
import { isValidTiffPath, normalizeTiffPathToFileUrl, getFileNameFromPath, inspectTiffPath, resolvePrintWorkflow, openTiffInSystem } from '@/lib/tiff-utils';
import { toast } from 'react-hot-toast';

export default function PrinterDashboard() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightOrderId = searchParams.get('orderId');
  const showRoleAwareSections = !highlightOrderId;
  const [jobs, setJobs] = useState<Order[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [jobItems, setJobItems] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  // New states for actions
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    orderId: string;
    actionType: 'START' | 'PAUSE' | 'RESUME' | 'COMPLETE';
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [materialUsage, setMaterialUsage] = useState({
    paperUsed: '',
    inkUsed: '',
    wastageNotes: '',
  });

  // Load items for the highlighted order so renderExpanded can show all items
  useEffect(() => {
    if (!highlightOrderId) return;

    const itemsRef = collection(db, 'orders', highlightOrderId, 'items');
    const unsub = onSnapshot(itemsRef, (snap) => {
      const arr = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setJobItems(prev => ({ ...prev, [highlightOrderId]: arr }));
    }, (err) => {
      console.error('Failed to load order items:', err);
    });

    return () => unsub();
  }, [highlightOrderId]);

  const handleActionSubmit = async () => {
    if (!actionModal) return;
    setProcessingId(actionModal.orderId);
    try {
      const { orderId, actionType } = actionModal;

      if (actionType === 'START') {
        await startTiffPrint(orderId, actionNotes || undefined);
        toast.success('Print started.');
      } else if (actionType === 'PAUSE') {
        await pauseJob(orderId, actionNotes || '');
        toast.success('Job paused.');
      } else if (actionType === 'RESUME') {
        await resumeJob(orderId, actionNotes || undefined);
        toast.success('Job resumed.');
      } else if (actionType === 'COMPLETE') {
        await completeTiffPrint(orderId, actionNotes || undefined, materialUsage);
        toast.success('Print completed.');
      }

      setActionModal(null);
      setActionNotes('');
      setMaterialUsage({ paperUsed: '', inkUsed: '', wastageNotes: '' });
    } catch (error: any) {
      console.error('Production action failed:', error);
      toast.error(error?.message || 'Action failed. Check console for details.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenTiff = async (order: Order) => {
    const printWorkflow = resolvePrintWorkflow(order);
    const tiffPath = printWorkflow?.tiffPath;
    if (!tiffPath || !isValidTiffPath(tiffPath)) {
      toast.error('No valid TIFF path is available for this job.');
      return;
    }

    toast.loading('Opening TIFF natively in system...', { id: 'tiff-open' });
    const openedNatively = await openTiffInSystem(tiffPath);

    if (openedNatively) {
      toast.success('TIFF opened directly in your default system viewer!', { id: 'tiff-open' });
    } else {
      toast.success('Bypassing browser safety - opening file URL...', { id: 'tiff-open' });
      window.open(normalizeTiffPathToFileUrl(tiffPath), '_blank', 'noopener,noreferrer');
    }

    try {
      await markTiffOpened(order.id);
    } catch (error) {
      console.error('Failed to mark TIFF as opened:', error);
    }
  };

  return (
    <RoleGuard allowedRoles={['PRINTER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6 animate-in fade-in duration-700">
        <StaffRoleSwitcher userRoles={(profile?.roles as StaffRole[]) || []} />
        
        {/* Machine Status Header */}
        <section className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Printer className="text-blue-600" size={20} />
              <h1 className="text-[28px] font-bold font-bold text-slate-800">Production Floor</h1>
            </div>
            <p className="text-sm text-slate-500">
              Manage your printing assignments and material usage in real-time.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-3">
             <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 text-sm font-bold">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               System Online
             </div>
          </div>
        </section>

        {showRoleAwareSections && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RoleUnassignedBacklog role="PRINTER" printerCategory={profile?.printerCategory} />
            <RoleActiveJobs role="PRINTER" printerCategory={profile?.printerCategory} />
          </div>
        )}

        {/* Dynamic Workflow Queue */}
        <div className={`grid grid-cols-1 ${highlightOrderId ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-6`}>
          <div className={highlightOrderId ? 'lg:col-span-1' : 'lg:col-span-2'}>
            <WorkflowTaskQueue 
              role="PRINTER"
              title="Active Print Queue"
              icon={<Printer className="w-5 h-5" />}
              highlightOrderId={highlightOrderId}
              orderHrefBuilder={(order) => `/printer/orders/${order.id}?returnTo=${encodeURIComponent('/admin/orders?highlight=' + order.id)}`}
              printerCategory={profile?.printerCategory}
              renderActions={(order: Order, isProcessing: boolean) => {
                const currentStep = order.workflowSnapshot?.steps[order.workflowSnapshot.currentStepIndex];
                const printWorkflow = resolvePrintWorkflow(order);
                const tiffPath = printWorkflow?.tiffPath;
                const tiffInfo = tiffPath ? inspectTiffPath(tiffPath) : null;
                
                return (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    {tiffPath ? (
                      <button
                        type="button"
                        onClick={() => handleOpenTiff(order)}
                        disabled={isProcessing}
                        className="w-full text-left rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 hover:bg-cyan-100 transition-all disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-widest text-cyan-700">TIFF Path</p>
                            <p className="text-[11px] font-mono text-cyan-900 break-all">{tiffInfo?.fileName || getFileNameFromPath(tiffPath)}</p>
                            <p className="text-[10px] text-cyan-700 break-all mt-1">{tiffPath}</p>
                          </div>
                          <ExternalLink size={12} className="shrink-0 text-cyan-700" />
                        </div>
                      </button>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                        No TIFF path assigned yet.
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {tiffPath && (
                        <button
                          onClick={() => handleOpenTiff(order)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-cyan-700 transition-all disabled:opacity-50"
                        >
                          <ExternalLink size={12} />
                          OPEN TIFF
                        </button>
                      )}
                    {currentStep?.status === 'PENDING' && (
                      <button 
                        onClick={async () => {
                          setProcessingId(order.id);
                          try {
                            await startTiffPrint(order.id);
                          } catch (error) {
                            console.error('Production action failed:', error);
                            alert('Action failed. Check console for details.');
                          } finally {
                            setProcessingId(null);
                          }
                        }}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                        <Play size={12} fill="currentColor" />
                        START PRINT
                      </button>
                    )}
                    {currentStep?.status === 'IN_PROGRESS' && (
                      <>
                        <button 
                          onClick={() => setActionModal({ isOpen: true, orderId: order.id, actionType: 'COMPLETE' })}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50"
                        >
                          <CheckCircle size={12} />
                          COMPLETE PRINT
                        </button>
                      </>
                    )}
                    {(currentStep?.status === 'PAUSED' || currentStep?.status === 'ON_HOLD') && (
                      <button 
                        onClick={() => setActionModal({ isOpen: true, orderId: order.id, actionType: 'RESUME' })}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        <Play size={12} fill="currentColor" />
                        RESUME
                      </button>
                    )}
                    </div>
                  </div>
                );
              }}
              renderExpanded={(order: Order) => (
                <div className="w-full">
                      <PrinterOrderWorkspace
                        orderId={order.id}
                        backHref="/printer/queue"
                        backLabel="Back to Queue"
                        secondaryHref="/printer"
                        secondaryLabel="Open Dashboard"
                        headerLabel="Printer Order Detail"
                        framed={true}
                        hideHeader={false}
                      />
                </div>
              )}
            />
          </div>
          {/* Production Summary removed per request */}
        </div>
        {/* Sidebar Metrics */}
        {!highlightOrderId && (
          <div className="space-y-4">
           <div className="bg-white p-4 rounded border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase">Efficiency Metrics</h3>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              
              <div className="space-y-4 pt-1">
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5">
                    <span className="text-slate-600">Ink Levels (CMYK)</span>
                    <span className="text-emerald-600">84% Optimal</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[84%]" />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5">
                    <span className="text-slate-600">Batch Throughput</span>
                    <span className="text-indigo-600">Processing...</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-[40%] animate-pulse" />
                  </div>
                </div>

                <div className="pt-2">
                  <div className="bg-blue-50 rounded p-2.5 flex gap-2.5 border border-blue-100">
                    <Info className="text-blue-600 shrink-0" size={14} />
                    <p className="text-[10px] font-medium leading-relaxed text-blue-800">
                      Real-time telemetry active. Queue synced with Firestore.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">
                {actionModal.actionType === 'START' && 'Start Production'}
                {actionModal.actionType === 'PAUSE' && 'Pause Production'}
                {actionModal.actionType === 'RESUME' && 'Resume Production'}
                {actionModal.actionType === 'COMPLETE' && 'Confirm Print Completion'}
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {actionModal.actionType === 'COMPLETE' && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800 font-medium">
                  Confirm print completed successfully?
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  {actionModal.actionType === 'COMPLETE' ? 'Completion Notes' : 'Production Notes'}
                  {actionModal.actionType === 'PAUSE' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  placeholder={actionModal.actionType === 'PAUSE' ? "Reason for pausing (e.g., Ink empty, machine error)..." : actionModal.actionType === 'COMPLETE' ? 'Optional confirmation notes...' : 'Optional notes...'}
                  className="w-full text-sm border border-slate-300 rounded p-2 min-h-[80px]"
                />
              </div>

              {actionModal.actionType === 'COMPLETE' && (
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Paper Used</label>
                    <input
                      type="text"
                      value={materialUsage.paperUsed}
                      onChange={e => setMaterialUsage(prev => ({ ...prev, paperUsed: e.target.value }))}
                      placeholder="e.g., 2 rolls of flex"
                      className="w-full text-sm border border-slate-300 rounded p-2"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Ink Used</label>
                    <input
                      type="text"
                      value={materialUsage.inkUsed}
                      onChange={e => setMaterialUsage(prev => ({ ...prev, inkUsed: e.target.value }))}
                      placeholder="e.g., 1L Cyan ink"
                      className="w-full text-sm border border-slate-300 rounded p-2"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Wastage Notes</label>
                    <textarea
                      value={materialUsage.wastageNotes}
                      onChange={e => setMaterialUsage(prev => ({ ...prev, wastageNotes: e.target.value }))}
                      placeholder="Optional wastage or reprint notes..."
                      className="w-full text-sm border border-slate-300 rounded p-2 min-h-[72px]"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => { setActionModal(null); setActionNotes(''); setMaterialUsage({ paperUsed: '', inkUsed: '', wastageNotes: '' }); }}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
                disabled={!!processingId}
              >
                Cancel
              </button>
              <button
                onClick={handleActionSubmit}
                disabled={!!processingId || (actionModal.actionType === 'PAUSE' && !actionNotes.trim())}
                className="px-4 h-11 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {processingId ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}

