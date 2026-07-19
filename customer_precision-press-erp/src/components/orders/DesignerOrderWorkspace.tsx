'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Palette, 
  CheckCircle, 
  PauseCircle, 
  Play, 
  Loader2, 
  X, 
  AlertTriangle, 
  Upload, 
  ExternalLink, 
  FileCheck,
  ChevronLeft,
  Clock,
  Send
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { db } from '@/lib/firebase';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp, getDoc, addDoc } from '@/lib/supabase-firestore-shim';
import { Order, OrderItem } from '@/types/models';
import { 
  startWorkflowStep, 
  advanceOrderWorkflow, 
  resumeWorkflowStep, 
  sendForCustomerApproval, 
  designerApproveCustomerArtwork, 
  designerSendToManager, 
  requestCustomerRedesign 
} from '@/lib/workflow';
import { WorkflowAttachments } from '@/components/production/WorkflowAttachments';
import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel';

type DesignerActionMode = 'complete' | 'pause' | 'redesign' | null;

interface ActionModalProps {
  order: Order;
  mode: DesignerActionMode;
  designUrl?: string;
  itemId?: string;
  onClose: () => void;
  onDone: () => void;
}

function ActionModal({ order, mode, designUrl, itemId, onClose, onDone }: ActionModalProps) {
  const [notes, setNotes] = useState('');
  const [requirements, setRequirements] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === 'complete') {
        const metadata = designUrl ? { 'workflow.designUrl': designUrl } : {};
        const res = await advanceOrderWorkflow(order.id, notes, metadata);
        if (res && res.success) {
          toast.success(`Order ${order.id} designer work completed.`);
          onDone();
        }
      } else if (mode === 'pause') {
        const res = await sendForCustomerApproval(order.id, designUrl, notes || 'Waiting for customer approval');
        if (res.success) {
          if (itemId) {
            await updateDoc(doc(db, 'orders', order.id, 'items', itemId), {
              designUrl: designUrl || '',
              designStatus: 'CUSTOMER_REVIEW'
            });
          }
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
              <p className="text-[13px] font-bold text-slate-800">#{order.id.slice(-6)} — {order.customerSnapshot?.name}</p>
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
              <p className="text-[14px] font-bold text-slate-800">₹{(order.amounts?.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
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
              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-[14px] font-medium text-amber-900">
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
                    className="w-full border rounded p-3 text-[13px] font-medium outline-none focus:ring-2 resize-none border-rose-200 focus:ring-rose-500/20 bg-rose-50/30"
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
                    className="w-full border rounded p-3 text-[13px] font-medium outline-none focus:ring-2 resize-none border-rose-200 focus:ring-rose-500/20 bg-rose-50/30"
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
                  className={`w-full border rounded p-3 text-[13px] font-medium outline-none focus:ring-2 resize-none ${isComplete ? 'border-slate-200 focus:ring-emerald-500/20' : 'border-amber-200 focus:ring-amber-500/20 bg-amber-50/30'}`}
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

import { getWorkspaceMode, WorkspaceMode } from '@/lib/workspaceAccess';

function OrderItemDesignBoxes({ 
  orderId, 
  items, 
  loadingItems, 
  order, 
  onSendToCustomer,
  mode = 'ACTIVE'
}: { 
  orderId: string; 
  items: OrderItem[]; 
  loadingItems: boolean; 
  order: Order | null; 
  onSendToCustomer?: () => void;
  mode?: WorkspaceMode;
}) {
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  const handleUpload = async (item: OrderItem, file: File) => {
    if (!file) return;
    if (mode === 'READ_ONLY') {
      toast.error('Completed stages cannot be modified.');
      return;
    }

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

      await addDoc(collection(db, 'orders', orderId, 'items', item.id, 'revisions'), {
        url: data.fileUrl,
        filename: data.filename,
        uploadedAt: serverTimestamp(),
        uploadedBy: 'Designer',
        revisionType: 'DESIGNER_PROOF',
        uploadStats: {
          originalSize: formatBytes(data.originalSize),
          compressedSize: formatBytes(data.compressedSize),
          ratio: data.compressionRatio
        }
      });

      // Store the uploaded design in itemWorkspace, but do not release to customer yet
      await updateDoc(doc(db, 'orders', orderId, 'items', item.id), {
        designStatus: 'DESIGN_IN_PROGRESS',
        'itemWorkspace.designerUploadUrl': data.fileUrl,
        'itemWorkspace.designerUploadedAt': serverTimestamp(),
        designUploadStats: {
          originalSize: formatBytes(data.originalSize),
          compressedSize: formatBytes(data.compressedSize),
          ratio: data.compressionRatio,
          filename: data.filename,
        },
      });

      toast.success(`Corrected design uploaded successfully! You can now review it and click "Send to Customer" to release it.`);
    } catch (error: any) {
      toast.error(error.message || 'Error uploading design');
    } finally {
      setUploadingItemId(null);
    }
  };

  if (loadingItems) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] font-semibold text-slate-500 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading item details...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-[13px] font-semibold text-slate-500">
        No design item found for this workspace.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {items.map((item, index) => {
        const isUploading = uploadingItemId === item.id;
        const rawPreviewUrl = item.designUrl || item.fileUrl || '';
        const previewUrl = (rawPreviewUrl.includes('images.unsplash.com') || rawPreviewUrl.includes('unsplash.com') || rawPreviewUrl === 'DESIGN_BY_US') ? '' : rawPreviewUrl;
        
        const isPdf = previewUrl.toLowerCase().includes('.pdf');
        const isImage = previewUrl ? (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(previewUrl) || (previewUrl.includes('cloudinary') && !isPdf)) : false;

        const customerArtworkUrl = item.itemWorkspace?.customerUploadUrl || 
                                   (item as any).customerUploadUrl || 
                                   (item.designType === 'CUSTOMER_DESIGN' ? item.fileUrl : '') || 
                                   order?.workflow?.customerDesignUrl || 
                                   order?.thumbnailUrl || 
                                   '';
        const hasCustomerArtwork = !!customerArtworkUrl && customerArtworkUrl !== 'DESIGN_BY_US';
        const customerArtworkIsPdf = customerArtworkUrl ? customerArtworkUrl.toLowerCase().includes('.pdf') : false;
        const customerArtworkIsImage = customerArtworkUrl ? (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(customerArtworkUrl) || (customerArtworkUrl.includes('cloudinary') && !customerArtworkIsPdf)) : false;

        const correctedArtworkUrl = item.itemWorkspace?.designerUploadUrl || 
                                    (item.designUrl && item.designUrl !== item.fileUrl ? item.designUrl : '') || 
                                    '';
        const hasCorrectedArtwork = !!correctedArtworkUrl && correctedArtworkUrl !== customerArtworkUrl;
        const correctedArtworkIsPdf = correctedArtworkUrl ? correctedArtworkUrl.toLowerCase().includes('.pdf') : false;
        const correctedArtworkIsImage = correctedArtworkUrl ? (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(correctedArtworkUrl) || (correctedArtworkUrl.includes('cloudinary') && !correctedArtworkIsPdf)) : false;

        return (
          <div key={item.id} className="rounded-3xl border border-white/60 bg-white/75 backdrop-blur-lg p-6 space-y-6 shadow-md">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100/50 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-600 mb-1">Item {index + 1} Workspace</p>
                <h5 className="text-[18px] font-black text-slate-900">{item.productName}</h5>
                <p className="text-[13px] text-slate-500 font-medium mt-1">
                  Quantity: <span className="text-slate-900 font-bold">{item.specs?.quantity}</span>
                  {item.specs?.width && item.specs?.height && (
                    <span className="ml-3 border-l pl-3 border-slate-200">
                      Size: <span className="text-slate-900 font-bold">{item.specs.width} {item.specs.widthUnit} × {item.specs.height} {item.specs.heightUnit}</span>
                    </span>
                  )}
                </p>
                {item.designType === 'CUSTOMER_DESIGN' && (
                  <span className="mt-2 inline-block px-3 py-0.5 rounded-full text-[10px] font-bold bg-amber-100/80 text-amber-800 border border-amber-200/50">
                    CUSTOMER DESIGN
                  </span>
                )}
                {item.designType === 'COMPANY_DESIGN' && (
                  <span className="mt-2 inline-block px-3 py-0.5 rounded-full text-[10px] font-bold bg-blue-100/80 text-blue-800 border border-blue-200/50">
                    DESIGN BY US
                  </span>
                )}
              </div>
              {item.designStatus === 'FINAL_READY' && (
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-emerald-100/80 text-emerald-700 rounded-full flex items-center gap-1 border border-emerald-200/50">
                  <CheckCircle size={12} /> Design Ready
                </span>
              )}
              {item.designStatus === 'CUSTOMER_REVIEW' && (
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-amber-100/80 text-amber-700 rounded-full flex items-center gap-1 animate-pulse border border-amber-200/50">
                  <Clock size={12} /> Awaiting Customer
                </span>
              )}
              {item.designStatus === 'APPROVED' && (
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-emerald-100/80 text-emerald-700 rounded-full flex items-center gap-1 border border-emerald-200/50">
                  <CheckCircle size={12} /> Customer Approved ✓
                </span>
              )}
            </div>

            {item.designType === 'COMPANY_DESIGN' && !hasCorrectedArtwork && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px] text-blue-800">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  Customer Requested Design (Design By Us)
                </div>
                <p className="text-[12px] font-medium text-slate-600">
                  The customer has requested the company to create the design. Please create the design and upload it below. Once uploaded, you can send it to the customer for verification.
                </p>
              </div>
            )}

            {hasCustomerArtwork && (
              <div className={`rounded-2xl border p-4 space-y-3 ${hasCorrectedArtwork ? 'border-purple-200/50 bg-purple-50/30' : 'border-amber-200/50 bg-amber-50/50'}`}>
                <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px]">
                  {hasCorrectedArtwork ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                      </span>
                      <span className="text-purple-800">Corrected Design Version Generated (Awaiting Customer Verification)</span>
                    </>
                  ) : (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span className="text-amber-800">Customer Design File Provided (Please Check Sizing/Resolution)</span>
                    </>
                  )}
                </div>
                <p className="text-[12px] font-medium text-slate-600">
                  {hasCorrectedArtwork 
                    ? 'A corrected version has been uploaded by the designer for the customer to approve. You can compare the original and corrected files below:'
                    : 'The customer placed their order with an uploaded design or past layout. Check the design file below to confirm layout compatibility:'
                  }
                </p>

                {hasCorrectedArtwork ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    {/* Customer original design */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase text-amber-800 tracking-wider">Original Customer Upload</span>
                      <div className="h-48 rounded-xl border border-slate-200/60 bg-white/80 overflow-hidden relative group flex items-center justify-center shadow-sm">
                        {customerArtworkIsImage ? (
                          <>
                            <img src={customerArtworkUrl} alt="Original Customer Design" className="h-full object-contain max-w-full" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <a 
                                href={customerArtworkUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-white/90 backdrop-blur-sm text-slate-900 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white shadow"
                              >
                                <ExternalLink size={14} /> Full Size View
                              </a>
                            </div>
                          </>
                        ) : customerArtworkIsPdf ? (
                          <div className="w-full h-full relative">
                            <iframe src={`${customerArtworkUrl}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a 
                                href={customerArtworkUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-white/95 text-slate-900 shadow-sm border rounded px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white"
                              >
                                <ExternalLink size={12} /> Open PDF
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center p-3">
                            <FileCheck className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                            <a href={customerArtworkUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-blue-600 hover:underline">
                              Open Customer File
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Corrected version */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-black uppercase text-emerald-800 tracking-wider">Corrected Design Version</span>
                      <div className="h-48 rounded-xl border border-emerald-200/60 bg-white/80 overflow-hidden relative group flex items-center justify-center shadow-sm">
                        {correctedArtworkIsImage ? (
                          <>
                            <img src={correctedArtworkUrl} alt="Corrected Designer Proof" className="h-full object-contain max-w-full" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <a 
                                href={correctedArtworkUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-white/90 backdrop-blur-sm text-slate-900 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white shadow"
                              >
                                <ExternalLink size={14} /> Full Size View
                              </a>
                            </div>
                          </>
                        ) : correctedArtworkIsPdf ? (
                          <div className="w-full h-full relative">
                            <iframe src={`${correctedArtworkUrl}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a 
                                href={correctedArtworkUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-white/95 text-slate-900 shadow-sm border rounded px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white"
                              >
                                <ExternalLink size={12} /> Open PDF
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center p-3">
                            <FileCheck className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                            <a href={correctedArtworkUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-blue-600 hover:underline">
                              Open Corrected File
                            </a>
                          </div>
                        )}
                      </div>
                      {item.designStatus !== 'CUSTOMER_REVIEW' && item.designStatus !== 'APPROVED' && (
                        <button
                          onClick={() => onSendToCustomer && onSendToCustomer()}
                          disabled={mode === 'READ_ONLY'}
                          className="mt-3 w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send size={12} /> {mode === 'READ_ONLY' ? 'Send Disabled (Completed)' : 'Send to Customer'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-48 rounded-xl border border-slate-200/60 bg-white/80 overflow-hidden relative group mt-2 flex items-center justify-center shadow-sm">
                    {customerArtworkIsImage ? (
                      <>
                        <img src={customerArtworkUrl} alt="Customer uploaded design" className="h-full object-contain max-w-full" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <a 
                            href={customerArtworkUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-white/90 backdrop-blur-sm text-slate-900 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white shadow"
                          >
                            <ExternalLink size={14} /> Full Size View
                          </a>
                        </div>
                      </>
                    ) : customerArtworkIsPdf ? (
                      <div className="w-full h-full relative">
                        <iframe src={`${customerArtworkUrl}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a 
                            href={customerArtworkUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-white/95 text-slate-900 shadow-sm border rounded px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white"
                          >
                            <ExternalLink size={12} /> Open PDF
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-3">
                        <FileCheck className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                        <a href={customerArtworkUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-blue-600 hover:underline">
                          Open Customer File
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!hasCustomerArtwork && hasCorrectedArtwork && (
              <div className="rounded-2xl border p-4 space-y-3 border-purple-200 bg-purple-50/20">
                <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px] text-purple-800">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                  </span>
                  Company Design Uploaded (Awaiting Customer Verification)
                </div>
                <p className="text-[12px] font-medium text-slate-600">
                  You have uploaded the design. Please review it below and click "Send to Customer" when it's ready.
                </p>

                <div className="h-48 rounded-xl border border-purple-200/60 bg-white/80 overflow-hidden relative group mt-2 flex items-center justify-center shadow-sm">
                  {correctedArtworkIsImage ? (
                    <>
                      <img src={correctedArtworkUrl} alt="Company Design" className="h-full object-contain max-w-full" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <a 
                          href={correctedArtworkUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="bg-white/90 backdrop-blur-sm text-slate-900 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white shadow"
                        >
                          <ExternalLink size={14} /> Full Size View
                        </a>
                      </div>
                    </>
                  ) : correctedArtworkIsPdf ? (
                    <div className="w-full h-full relative">
                      <iframe src={`${correctedArtworkUrl}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a 
                          href={correctedArtworkUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="bg-white/95 text-slate-900 shadow-sm border rounded px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white"
                        >
                          <ExternalLink size={12} /> Open PDF
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-3">
                      <FileCheck className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                      <a href={correctedArtworkUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-blue-600 hover:underline">
                        Open Design File
                      </a>
                    </div>
                  )}
                </div>

                {item.designStatus !== 'CUSTOMER_REVIEW' && item.designStatus !== 'APPROVED' && (
                  <button
                    onClick={() => onSendToCustomer && onSendToCustomer()}
                    disabled={mode === 'READ_ONLY'}
                    className="mt-3 w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={12} /> {mode === 'READ_ONLY' ? 'Send Disabled (Completed)' : 'Send to Customer'}
                  </button>
                )}
              </div>
            )}

            <div className={hasCorrectedArtwork ? "space-y-4 max-w-xl" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {item.designType === 'CUSTOMER_DESIGN' ? 'Upload Corrected Version' : 'Upload Final Design'}
                </label>
                {item.designStatus === 'CUSTOMER_REVIEW' && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest">Awaiting Customer Verification</p>
                      <p className="text-[11px] text-amber-700 mt-0.5 font-medium">The customer needs to verify this design before you can mark the work as done. You may re-upload to replace it.</p>
                    </div>
                  </div>
                )}
                <label className={`relative flex items-center justify-center w-full h-20 border-2 border-dashed rounded-2xl transition-all ${
                  mode === 'READ_ONLY'
                    ? 'bg-slate-100/50 border-slate-300 opacity-60 cursor-not-allowed'
                    : isUploading
                      ? 'bg-slate-50/40 border-slate-300 cursor-not-allowed'
                      : 'border-purple-200 bg-purple-50/30 hover:bg-purple-50/60 hover:border-purple-400 cursor-pointer'
                }`}>
                  <div className="flex items-center justify-center gap-3 px-4 py-2">
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 text-purple-50 animate-spin text-purple-500" />
                        <p className="text-[13px] font-bold text-slate-700">Uploading...</p>
                      </>
                    ) : mode === 'READ_ONLY' ? (
                      <>
                        <div className="w-8 h-8 bg-slate-200 rounded-full shadow flex items-center justify-center text-slate-400 shrink-0">
                          <Upload className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-[13px] font-bold text-slate-500">Uploads Disabled</p>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Completed Stage</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 bg-white/95 rounded-full shadow flex items-center justify-center text-purple-600 shrink-0">
                          <Upload className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-[13px] font-bold text-slate-700">Click to upload design</p>
                          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">PNG, JPG, PDF</p>
                        </div>
                      </>
                    )}
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) handleUpload(item, file);
                     }}
                    disabled={isUploading || mode === 'READ_ONLY'}
                  />
                </label>
              </div>

              {!hasCustomerArtwork && !hasCorrectedArtwork && (
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Preview</label>
                  <div className="h-48 rounded-xl border border-slate-200/60 bg-white/80 flex items-center justify-center overflow-hidden relative group shadow-sm">
                    {previewUrl ? (
                      isImage ? (
                        <>
                          <img src={previewUrl} alt="Design preview" className="w-full h-full object-contain bg-slate-100" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a 
                              href={previewUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-white/90 backdrop-blur-sm text-slate-900 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white shadow"
                            >
                              <ExternalLink size={14} /> Full View
                            </a>
                          </div>
                        </>
                      ) : isPdf ? (
                        <div className="w-full h-full relative">
                          <iframe src={`${previewUrl}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a 
                              href={previewUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-white/95 text-slate-900 shadow-sm border rounded px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-white"
                            >
                              <ExternalLink size={12} /> Open PDF
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <FileCheck className="w-8 h-8 text-slate-400" />
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-blue-600 hover:underline">
                            View Document
                          </a>
                        </div>
                      )
                    ) : (
                      <p className="text-[13px] font-medium text-slate-400 italic">No design uploaded yet</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface DesignerOrderWorkspaceProps {
  orderId: string;
  itemId?: string;
}

export function DesignerOrderWorkspace({ orderId, itemId }: DesignerOrderWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionMode, setActionMode] = useState<DesignerActionMode>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    
    setLoading(true);
    setLoadingItems(true);

    const q = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.exists()) {
        const orderData = { id: snapshot.id, ...snapshot.data() } as Order;
        
        if (orderData.customerId) {
          const custSnap = await getDoc(doc(db, 'profiles', orderData.customerId));
          if (custSnap.exists()) {
            orderData.customerSnapshot = custSnap.data() as any;
          }
        }
        setOrder(orderData);
      } else {
        setOrder(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching designer order:', error);
      toast.error('Failed to load order data');
      setLoading(false);
    });

    const itemsUnsub = onSnapshot(collection(db, 'orders', orderId, 'items'), (itemsSnap) => {
      let fetchedItems = itemsSnap.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as OrderItem));
      if (itemId) {
        fetchedItems = fetchedItems.filter(i => i.id === itemId);
      }
      setItems(fetchedItems);
      setLoadingItems(false);
    }, () => {
      setLoadingItems(false);
    });

    return () => {
      unsubscribe();
      itemsUnsub();
    };
  }, [orderId, itemId]);

  const handleReturnRedirect = () => {
    const returnTo = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
    try {
      const url = new URL(returnTo || '/admin/orders', window.location.origin);
      if (orderId) {
        if (url.pathname.includes('/orders')) {
          url.searchParams.set('highlight', orderId);
        } else {
          url.searchParams.set('orderId', orderId);
        }
      }
      setTimeout(() => router.push(url.pathname + url.search), 700);
    } catch (e) {
      setTimeout(() => router.push(returnTo || '/admin/orders'), 700);
    }
  };

  const openAction = (mode: DesignerActionMode) => {
    if (!order) return;
    setSelectedOrder(order);
    setActionMode(mode);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setActionMode(null);
  };

  const handleStart = async () => {
    if (!order) return;
    setProcessingId(order.id);
    try {
      await startWorkflowStep(order.id);
      toast.success('Started working on order.');
    } catch (error: any) {
      toast.error(error.message || 'Error starting work.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResume = async () => {
    if (!order) return;
    setProcessingId(order.id);
    try {
      await resumeWorkflowStep(order.id, 'Customer approved. Resuming.');
      toast.success('Resumed working on order.');
    } catch (error: any) {
      toast.error(error.message || 'Error resuming work.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveCustomerArtwork = async () => {
    if (!order) return;
    setProcessingId(order.id);
    try {
      await designerApproveCustomerArtwork(order.id);
      toast.success('Customer artwork approved successfully!');
      handleReturnRedirect();
    } catch (error: any) {
      toast.error(error.message || 'Error approving artwork.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSendToManager = async () => {
    if (!order) return;
    setProcessingId(order.id);
    try {
      await designerSendToManager(order.id);
      toast.success('Approved design sent to manager.');
      handleReturnRedirect();
    } catch (error: any) {
      toast.error(error.message || 'Error sending design to manager.');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="mx-auto animate-spin text-purple-600" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-600/40">Loading designer workspace...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
        <div className="max-w-md space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Palette size={28} />
          </div>
          <div className="space-y-2">
            <h1 className="text-[28px] font-bold font-black tracking-tight text-slate-900">Order Not Available</h1>
            <p className="text-[14px] text-slate-500">This order could not be loaded or doesn't exist.</p>
          </div>
          <button 
            onClick={handleReturnRedirect} 
            className="rounded-lg bg-purple-600 px-5 py-3 text-[13px] font-black uppercase tracking-widest text-white transition-colors hover:bg-purple-700"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const mode = getWorkspaceMode('DESIGNER', order.workflowSnapshot);
  const designerStep = order.workflowSnapshot?.steps.find(s => s.role === 'DESIGNER');
  const currentStep = order.workflowSnapshot?.steps[order.workflowSnapshot.currentStepIndex];
  const isProcessing = processingId === order.id;

  const approvalStatus = order.workflow?.customerApproval?.status || 'NOT_REQUIRED';
  const isDesignApproved = approvalStatus === 'APPROVED';

  // Parse order.items safely
  let orderItemsParsed: OrderItem[] = [];
  if (order && order.items) {
    if (typeof order.items === 'string') {
      try {
        orderItemsParsed = JSON.parse(order.items);
      } catch (e) {
        console.error('Error parsing order.items string:', e);
      }
    } else if (Array.isArray(order.items)) {
      orderItemsParsed = order.items;
    } else if (typeof order.items === 'object') {
      orderItemsParsed = Object.values(order.items);
    }
  }

  // Merge the subcollection items with orderItemsParsed details by id
  const mergedItems = items.map(subItem => {
    const matchingOrderItem = orderItemsParsed.find(oItem => oItem.id === subItem.id);
    if (matchingOrderItem) {
      return {
        ...matchingOrderItem,
        ...subItem,
        specs: {
          ...matchingOrderItem.specs,
          ...(subItem.specs || {})
        },
        materialMetadata: {
          ...matchingOrderItem.materialMetadata,
          ...(subItem.materialMetadata || {})
        },
        pricingSnapshot: {
          ...matchingOrderItem.pricingSnapshot,
          ...(subItem.pricingSnapshot || {})
        },
        itemWorkspace: {
          ...matchingOrderItem.itemWorkspace,
          ...(subItem.itemWorkspace || {})
        }
      } as OrderItem;
    }
    return subItem;
  });

  // Fallback to order.items if subcollection is empty
  const rawDisplayItems = mergedItems.length > 0 ? mergedItems : orderItemsParsed;
  const displayItems = itemId ? rawDisplayItems.filter(i => i.id === itemId) : rawDisplayItems;

  // Check if any DESIGN_BY_US items are missing an upload
  const hasUnuploadedDesigns = displayItems.some(i => {
    if (i.designType === 'COMPANY_DESIGN' || i.designUrl === 'DESIGN_BY_US' || i.itemWorkspace?.customerUploadUrl === 'DESIGN_BY_US') {
      const designerUpload = i.itemWorkspace?.designerUploadUrl || (i.designUrl !== 'DESIGN_BY_US' ? i.designUrl : null);
      return !designerUpload;
    }
    return false;
  });

  const orderTime = order.createdAt && (order.createdAt as any).seconds 
    ? (order.createdAt as any).seconds * 1000 
    : (typeof order.createdAt === 'string' ? new Date(order.createdAt).getTime() : 0);
  const isStrictFlow = orderTime > 1781568000000; // Enforce on orders created after June 16, 2026

  let completeBlocked = false;
  let blockReason = 'Mark designer work as complete';

  if (hasUnuploadedDesigns) {
    completeBlocked = true;
    blockReason = 'You must upload a design for "Design By Us" items first';
  } else {
    // Check if any items are explicitly in review
    const hasItemsInReview = displayItems.some(i => i.designStatus === 'CUSTOMER_REVIEW');
    if (hasItemsInReview) {
      completeBlocked = true;
      blockReason = 'Waiting for customer to verify the design';
    } else if (isStrictFlow) {
      // For new orders, enforce that "Design By Us" items MUST be 'APPROVED'
      const hasUnapprovedCompanyDesigns = displayItems.some(i => 
        (i.designType === 'COMPANY_DESIGN' || i.designUrl === 'DESIGN_BY_US' || i.itemWorkspace?.customerUploadUrl === 'DESIGN_BY_US') 
        && i.designStatus !== 'APPROVED'
      );
      if (hasUnapprovedCompanyDesigns) {
        completeBlocked = true;
        blockReason = 'You must send the design to the customer and wait for their approval';
      }
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-[#ecd9fa]/65 via-[#f4f2f8]/90 to-[#daf4fc]/65 rounded-[2.5rem] shadow-inner space-y-6 animate-in fade-in duration-200 pb-8 min-h-screen">
      {/* Header Panel */}
      <section className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-3xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 flex flex-row items-center justify-between gap-4 flex-wrap md:flex-nowrap">
          <div className="flex flex-row items-center gap-3 min-w-0">
            <span className="p-2 bg-purple-100/80 text-purple-700 rounded-xl shrink-0 hidden sm:inline-flex">
              <Palette size={16} />
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
                  {currentStep?.label && (
                    <span className="inline-flex items-center rounded-full border border-purple-200/50 bg-purple-50/50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-purple-700">
                      Step: {currentStep.label}
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

            {/* Stage Actions */}
            {mode === 'READ_ONLY' ? (
              <div className="flex items-center gap-2">
                <button
                  disabled
                  className="px-4 h-9 bg-slate-100 text-slate-400 border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 opacity-75 cursor-not-allowed"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
                  Already Completed
                </button>
              </div>
            ) : (
              currentStep && (
                <div className="flex items-center gap-2">
                  {currentStep.status === 'PENDING' && (
                    <button 
                      onClick={handleStart}
                      disabled={isProcessing}
                      className="px-4 h-9 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50 shadow hover:bg-blue-700 transition-all duration-200"
                    >
                      {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      START WORK
                    </button>
                  )}

                  {currentStep.status === 'IN_PROGRESS' && (
                    <div className="flex items-center gap-1.5">
                      {order.workflow?.customerDesignProvided === true && (
                        <>
                          <button
                            onClick={handleApproveCustomerArtwork}
                            disabled={isProcessing}
                            className="px-4 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50 shadow transition-all duration-200"
                            title="Approve Customer Uploaded Artwork"
                          >
                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            APPROVE ARTWORK
                          </button>
                          <button
                            onClick={() => openAction('redesign')}
                            disabled={isProcessing}
                            className="px-4 h-9 bg-rose-600 hover:bg-rose-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50 shadow transition-all duration-200"
                            title="Request Artwork Redesign"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            REQUEST REDESIGN
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => openAction('pause')}
                        disabled={isProcessing}
                        className="px-4 h-9 bg-amber-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-amber-700 disabled:opacity-50 shadow transition-all duration-200"
                        title="Send Proof For Customer Approval"
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        {order.workflow?.customerDesignProvided ? 'UPLOAD CORRECTED VERSION' : 'SEND FOR VERIFICATION'}
                      </button>
                      <button 
                        onClick={() => openAction('complete')}
                        disabled={isProcessing || completeBlocked}
                        title={blockReason}
                        className={`px-4 h-9 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow transition-all duration-200 ${
                          completeBlocked
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        {completeBlocked && hasUnuploadedDesigns ? 'UPLOAD DESIGN FIRST' : completeBlocked ? 'WAITING APPROVAL' : 'COMPLETE'}
                      </button>
                    </div>
                  )}

                  {(currentStep.status === 'ON_HOLD' || currentStep.status === 'PAUSED') && (
                     <button 
                       onClick={handleResume}
                       disabled={isProcessing}
                       className="px-4 h-9 bg-purple-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-purple-700 disabled:opacity-50 shadow transition-all duration-200"
                     >
                       {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                       RESUME WORK
                     </button>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Main Designer Content */}
      {currentStep && (
        <div className="space-y-6">
          {mode === 'READ_ONLY' && (
            <div className="rounded-3xl border border-blue-200 bg-blue-50/50 p-5 flex items-start gap-3 shadow-md">
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

          {isDesignApproved && mode !== 'READ_ONLY' && (
            <div className="rounded-2xl border border-emerald-200/50 bg-emerald-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">Design Approved</p>
                <p className="text-[14px] font-medium text-emerald-900 mt-1">Customer approved this design. It is ready to be handed to manager stage.</p>
              </div>
              <button
                onClick={handleSendToManager}
                disabled={processingId === order.id}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.25em] text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition-all"
              >
                {processingId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Send to Manager
              </button>
            </div>
          )}

          <OrderItemDesignBoxes orderId={order.id} items={displayItems} loadingItems={loadingItems} order={order} onSendToCustomer={() => openAction('pause')} mode={mode} />
        </div>
      )}

      {/* Full Booking Details */}
      <OrderDetailsPanel 
        order={order} 
        role="DESIGNER" 
        className="bg-white/60 backdrop-blur-lg border border-white/50 shadow-lg rounded-3xl text-slate-800"
      />

      {/* Attachments & Files Section */}
      {designerStep && (
        <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-lg">
          <WorkflowAttachments 
            orderId={order.id}
            currentStep={designerStep}
            mode={mode}
          />
        </div>
      )}

      {/* Action Modal for Designer */}
      {actionMode && selectedOrder && (
        <ActionModal
          order={selectedOrder}
          mode={actionMode}
          designUrl={items[0]?.itemWorkspace?.designerUploadUrl || items[0]?.designUrl || items[0]?.fileUrl}
          itemId={items[0]?.id}
          onClose={closeModal}
          onDone={() => {
            closeModal();
            handleReturnRedirect();
          }}
        />
      )}
    </div>
  );
}
