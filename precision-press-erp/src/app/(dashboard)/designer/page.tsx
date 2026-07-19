'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { Palette, CheckCircle, PauseCircle, Play, Loader2, X, AlertTriangle, Upload, ExternalLink, FileCheck } from 'lucide-react';
import { WorkflowTaskQueue } from '@/components/production/WorkflowTaskQueue';
import { startWorkflowStep, advanceOrderWorkflow, holdOrderWorkflow, resumeWorkflowStep, sendForCustomerApproval, designerApproveCustomerArtwork, designerSendToManager, requestCustomerRedesign } from '@/lib/workflow';
import { Order, OrderItem } from '@/types/models';
import { WorkflowAttachments } from '@/components/production/WorkflowAttachments';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';

type DesignerActionMode = 'complete' | 'pause' | 'redesign' | null;

interface ActionModalProps {
  order: Order;
  mode: DesignerActionMode;
  onClose: () => void;
  onDone: () => void;
}

function ActionModal({ order, mode, onClose, onDone }: ActionModalProps) {
  const [notes, setNotes] = useState('');
  const [requirements, setRequirements] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === 'complete') {
        const res = await advanceOrderWorkflow(order.id, notes);
        if (res && res.success) {
          toast.success(`Order ${order.id} designer work completed.`);
          onDone();
        }
      } else if (mode === 'pause') {
        const res = await sendForCustomerApproval(order.id, undefined, notes || 'Waiting for customer approval');
        if (res.success) {
          toast.success(`Order ${order.id} sent for verification.`);
          onDone();
        }
      } else if (mode === 'redesign') {
        if (!notes.trim() || !requirements.trim()) {
          toast.error('Notes and correction requirements are both required.');
          setLoading(false);
          return;
        }
        const res = await requestCustomerRedesign(order.id, notes, requirements);
        if (res.success) {
          toast.success(`Redesign requested for Order ${order.id}.`);
          onDone();
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    } finally {
      setLoading(false);
    }
  };

  const isComplete = mode === 'complete';
  const isPause = mode === 'pause';
  const isRedesign = mode === 'redesign';

  const modalBg = isComplete ? 'bg-emerald-50 border-emerald-200' : isRedesign ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200';
  const textCol = isComplete ? 'text-emerald-600' : isRedesign ? 'text-rose-600' : 'text-amber-600';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-5 py-3 border-b flex items-center justify-between ${modalBg}`}>
          <div className="flex items-center gap-2">
            {isComplete && <CheckCircle className="text-emerald-600" size={16} />}
            {isPause && <PauseCircle className="text-amber-600" size={16} />}
            {isRedesign && <AlertTriangle className="text-rose-600" size={16} />}
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${textCol}`}>
                {isComplete ? 'Complete Designer Stage' : isRedesign ? 'Request Customer Redesign' : 'Await Customer Approval'}
              </p>
              <p className="text-xs font-bold text-slate-800">#{order.id.slice(-6)} — {order.customerSnapshot?.displayName || order.customerSnapshot?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded bg-white/70 flex items-center justify-center text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Order summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Order Value</p>
              <p className="text-sm font-bold text-slate-800">₹{(order.amounts?.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Order Type</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${order.orderType === 'CREDIT' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {order.orderType}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-3">
            {isPause && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-sm font-medium text-amber-900">
                Your uploaded item designs will be used for verification. Add any notes for the customer below, then send it.
              </div>
            )}
            
            {isRedesign && (
              <div className="space-y-3">
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-widest block mb-1.5 ${textCol}`}>
                    Redesign Notes (Required)
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Describe what corrections or updates are needed..."
                    rows={3}
                    className="w-full border rounded p-3 text-xs font-medium outline-none focus:ring-2 resize-none border-rose-200 focus:ring-rose-500/20 bg-rose-50/30"
                  />
                </div>
                <div>
                  <label className={`text-[10px] font-bold uppercase tracking-widest block mb-1.5 ${textCol}`}>
                    Correction Requirements (Required)
                  </label>
                  <textarea
                    value={requirements}
                    onChange={e => setRequirements(e.target.value)}
                    placeholder="Specify key items to correct (e.g. 1. Margins 2. DPI)..."
                    rows={3}
                    className="w-full border rounded p-3 text-xs font-medium outline-none focus:ring-2 resize-none border-rose-200 focus:ring-rose-500/20 bg-rose-50/30"
                  />
                </div>
              </div>
            )}

            {!isRedesign && (
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-widest block mb-1.5 ${isComplete ? 'text-slate-600' : textCol}`}>
                  {isComplete ? 'Design Notes (Optional)' : 'Notes for Customer (Required)'}
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={isComplete ? 'e.g. Completed design as per instructions...' : 'e.g. Please approve the attached proofs...'}
                  rows={3}
                  className={`w-full border rounded p-3 text-xs font-medium outline-none focus:ring-2 resize-none ${isComplete ? 'border-slate-200 focus:ring-emerald-500/20' : 'border-amber-200 focus:ring-amber-500/20 bg-amber-50/30'}`}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={loading || (isPause && !notes.trim()) || (isRedesign && (!notes.trim() || !requirements.trim()))}
              className={`flex-1 h-9 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 ${isComplete ? 'bg-emerald-600 text-white hover:bg-emerald-700' : isRedesign ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : isComplete ? <CheckCircle size={12} /> : isRedesign ? <AlertTriangle size={12} /> : <PauseCircle size={12} />}
              {loading ? 'Processing...' : isComplete ? 'Confirm Completion' : isRedesign ? 'Send Redesign Request' : 'Send for Verification'}
            </button>
            <button onClick={onClose} className="px-4 h-11 rounded border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderItemDesignBoxes({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  useEffect(() => {
    setLoadingItems(true);
    const unsubscribe = onSnapshot(collection(db, 'orders', orderId, 'items'), (snapshot) => {
      setItems(snapshot.docs.map((snapshotDoc) => ({ ...snapshotDoc.data(), id: snapshotDoc.id } as OrderItem)));
      setLoadingItems(false);
    }, () => {
      setLoadingItems(false);
    });

    return () => unsubscribe();
  }, [orderId]);

  const handleUpload = async (item: OrderItem, file: File) => {
    if (!file) return;

    setUploadingItemId(item.id);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = 2;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      };

      await updateDoc(doc(db, 'orders', orderId, 'items', item.id), {
        designUrl: data.fileUrl,
        designStatus: 'UPLOADED',
        designUploadStats: {
          originalSize: formatBytes(data.originalSize),
          compressedSize: formatBytes(data.compressedSize),
          ratio: data.compressionRatio,
          filename: data.filename,
        },
        updatedAt: serverTimestamp(),
      });

      toast.success(`Uploaded design for ${item.productName}`);
    } catch (error: any) {
      toast.error(error.message || 'Error uploading design');
    } finally {
      setUploadingItemId(null);
    }
  };

  if (loadingItems) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-500 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading item boxes...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs font-semibold text-slate-500">
        No order items found for this job.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {items.map((item, index) => {
        const isUploading = uploadingItemId === item.id;
        const previewUrl = item.designUrl || item.fileUrl || '';
        const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(previewUrl);

        return (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Item {index + 1}</p>
                <h5 className="mt-1 text-sm font-black text-slate-900">{item.productName}</h5>
                <p className="text-[11px] text-slate-500 font-medium mt-1">
                  {item.specs.width} x {item.specs.height} {item.specs.widthUnit} • Qty {item.specs.quantity}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border ${item.designUrl ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                {item.designUrl ? 'Design Uploaded' : 'Awaiting Upload'}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
              <div className="h-36 flex items-center justify-center bg-slate-100">
                {previewUrl ? (
                  isImage ? (
                    <img src={previewUrl} alt={item.productName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-slate-500">PDF / Document Preview</span>
                  )
                ) : (
                  <div className="text-center space-y-1">
                    <Upload className="mx-auto text-slate-400" size={22} />
                    <p className="text-xs font-bold text-slate-500">Upload the design for this item</p>
                  </div>
                )}
              </div>

              <div className="p-3 flex flex-wrap gap-2">
                <label className="flex-1 min-w-[11rem] inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white cursor-pointer hover:bg-slate-800 transition-all">
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload size={14} />}
                  {isUploading ? 'Uploading...' : 'Upload Design'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleUpload(item, file);
                        event.currentTarget.value = '';
                      }
                    }}
                  />
                </label>

                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-[9rem] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all"
                  >
                    <ExternalLink size={14} />
                    View File
                  </a>
                )}
              </div>

              {item.designUploadStats && (
                <div className="px-3 pb-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {item.designUploadStats.filename} • {item.designUploadStats.originalSize} → {item.designUploadStats.compressedSize}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DesignerDashboard() {
  const router = useRouter();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionMode, setActionMode] = useState<DesignerActionMode>(null);
  const searchParams = useSearchParams();
  const highlightOrderId = searchParams.get('orderId');

  const handleReturnRedirect = () => {
    const returnTo = searchParams.get('returnTo');
    if (returnTo) {
      router.push(returnTo);
    }
  };

  // Auto-open modal if highlightOrderId is provided and we want to do that? No, just highlight for now.

  const openAction = (order: Order, mode: DesignerActionMode) => {
    setSelectedOrder(order);
    setActionMode(mode);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setActionMode(null);
  };

  const handleStart = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await startWorkflowStep(orderId);
      toast.success('Started working on order.');
    } catch (error: any) {
      toast.error(error.message || 'Error starting work.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResume = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await resumeWorkflowStep(orderId, 'Customer approved. Resuming.');
      toast.success('Resumed working on order.');
    } catch (error: any) {
      toast.error(error.message || 'Error resuming work.');
    } finally {
      setProcessingId(null);
    }
  };


  const handleApproveCustomerArtwork = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await designerApproveCustomerArtwork(orderId);
      toast.success('Customer artwork approved successfully!');
      handleReturnRedirect();
    } catch (error: any) {
      toast.error(error.message || 'Error approving artwork.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSendToManager = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await designerSendToManager(orderId);
      toast.success('Approved design sent to manager.');
      handleReturnRedirect();
    } catch (error: any) {
      toast.error(error.message || 'Error sending design to manager.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderActions = (order: Order, isQueueProcessing: boolean) => {
    const currentStep = order.workflowSnapshot?.steps[order.workflowSnapshot.currentStepIndex];
    const isProcessing = isQueueProcessing || processingId === order.id;

    if (!currentStep) return null;

    return (
      <div className="flex items-center gap-2">
        {currentStep.status === 'PENDING' && (
          <button 
            onClick={(e) => { e.stopPropagation(); handleStart(order.id); }}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            START
          </button>
        )}

        {currentStep.status === 'IN_PROGRESS' && (
          <>
            {order.workflow?.customerDesignProvided === true && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleApproveCustomerArtwork(order.id); }}
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                  title="Approve Customer Uploaded Artwork"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  APPROVE ARTWORK
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openAction(order, 'redesign'); }}
                  disabled={isProcessing}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  title="Request Artwork Redesign"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  REQUEST REDESIGN
                </button>
              </>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); openAction(order, 'pause'); }}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-amber-700 disabled:opacity-50"
              title="Send Proof For Customer Approval"
            >
              <PauseCircle className="w-4 h-4" />
              {order.workflow?.customerDesignProvided ? 'UPLOAD CORRECTED VERSION' : 'SEND FOR VERIFICATION'}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); openAction(order, 'complete'); }}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
            >
              <CheckCircle className="w-4 h-4" />
              COMPLETE
            </button>
          </>
        )}

        {(currentStep.status === 'ON_HOLD' || currentStep.status === 'PAUSED') && (
           <button 
             onClick={(e) => { e.stopPropagation(); handleResume(order.id); }}
             disabled={isProcessing}
             className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-purple-700 disabled:opacity-50"
           >
             {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
             RESUME
           </button>
        )}
      </div>
    );
  };

  const renderExpanded = (order: Order) => {
    const currentStep = order.workflowSnapshot?.steps[order.workflowSnapshot.currentStepIndex];
    if (!currentStep) return null;

    const approvalStatus = order.workflow?.customerApproval?.status || 'NOT_REQUIRED';
    const isDesignApproved = approvalStatus === 'APPROVED';

    return (
      <div className="space-y-6">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight uppercase">Item Design Work</h4>
            <span className="text-[9px] font-black uppercase text-slate-600 tracking-widest bg-white px-2.5 py-1 rounded-full border border-slate-200">
              Approval: {approvalStatus}
            </span>
          </div>

          {isDesignApproved && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">Design Approved</p>
                <p className="text-sm font-medium text-emerald-900 mt-1">Customer approved this design. It is ready to be handed to manager stage.</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSendToManager(order.id);
                }}
                disabled={processingId === order.id}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-[0.25em] text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {processingId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Send to Manager
              </button>
            </div>
          )}

          <OrderItemDesignBoxes orderId={order.id} />
        </div>
      </div>
    );
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'MANAGER', 'DESIGNER', 'ACDEMA']}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <WorkflowTaskQueue 
          role="DESIGNER" 
          title="Creative Studio Backlog" 
          icon={<Palette className="w-6 h-6" />} 
          renderActions={renderActions}
          renderExpanded={renderExpanded}
          highlightOrderId={highlightOrderId}
          orderHrefBuilder={(order) => `/admin/orders/${order.id}?returnTo=${encodeURIComponent('/admin/orders?highlight=' + order.id)}`}
        />

        {/* Action Modal for Designer */}
        {selectedOrder && actionMode && (
          <ActionModal
            order={selectedOrder}
            mode={actionMode}
            onClose={closeModal}
            onDone={() => {
              closeModal();
              handleReturnRedirect();
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}



