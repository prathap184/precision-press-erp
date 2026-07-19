'use client';


import React, { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { customerApproveDesign, customerRejectDesign, customerReuploadDesign } from '@/lib/workflow';
import { refreshAuthTokenCookie } from '@/lib/refresh-auth-token';
import {
  Package,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Palette,
  Printer,
  Truck,
  Circle,
  ShieldCheck,
  User,
  Loader2,
  FileText,
  IndianRupee,
  Image as ImageIcon,
  PartyPopper,
  ArrowRight,
  XCircle,
  Check,
  Clock,
  ExternalLink,
  Upload,
  Send,
  Download
} from 'lucide-react';

// Status milestones for tracking
const MILESTONES = [
  { id: 'PLACED', label: 'Order Placed', icon: <Package size={20} />, description: 'Order received and logged in system' },
  { id: 'PAYMENT_VERIFIED', label: 'Payment Verified', icon: <ShieldCheck size={20} />, description: 'Transaction confirmed by accounts' },
  { id: 'DESIGNING', label: 'Designing', icon: <Palette size={20} />, description: 'Artwork prep and layout design' },
  { id: 'PRINTING', label: 'In Production', icon: <Printer size={20} />, description: 'Job assigned to production press' },
  { id: 'COMPLETED', label: 'Quality Check', icon: <CheckCircle2 size={20} />, description: 'Printing finished & QC passed' },
  { id: 'DISPATCHED', label: 'Dispatched', icon: <Truck size={20} />, description: 'Shipped or ready for pick-up' },
  { id: 'DELIVERED', label: 'Delivered', icon: <PartyPopper size={20} />, description: 'Order completed and delivered' },
];

const statusToMilestone: Record<string, string> = {
  'PLACED': 'PLACED',
  'PAYMENT_PENDING': 'PLACED',
  'PAYMENT_VERIFIED': 'PAYMENT_VERIFIED',
  'ACCOUNTANT_APPROVED': 'PAYMENT_VERIFIED',
  'DESIGNING': 'DESIGNING',
  'DESIGN_READY': 'DESIGNING',
  'ASSIGNED': 'PRINTING',
  'IN_PROGRESS': 'PRINTING',
  'PRODUCTION_PAUSED': 'PRINTING',
  'COMPLETED': 'COMPLETED',
  'DISPATCHED': 'DISPATCHED',
  'IN_TRANSIT': 'DISPATCHED',
  'DELIVERED': 'DELIVERED',
};

function parseTimestamp(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function formatOrderDate(date: Date | null): string {
  if (!date) return '—';
  return date
    .toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    .replace(/ am/i, ' am')
    .replace(/ pm/i, ' pm');
}

function formatDispatchDate(date: Date | null): string {
  if (!date) return 'Pending Dispatch...';
  return date.toLocaleDateString('en-IN');
}

function formatLogDate(timestamp: any): string {
  if (!timestamp) return '—';
  const date = parseTimestamp(timestamp);
  if (!date || isNaN(date.getTime())) return '—';
  return date
    .toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    .replace(/ am/i, ' am')
    .replace(/ pm/i, ' pm');
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = 2;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function CustomerDesignUpload({ orderId, item, onUploadSuccess, displayName }: { orderId: string, item: any, onUploadSuccess: () => void, displayName: string }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', orderId);
      formData.append('itemId', item.id);
      formData.append('uploadType', 'customer_artwork');

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

      // 1. Insert revision
      const { error: revError } = await supabase
        .from('design_revisions')
        .insert({
          order_id: orderId,
          item_id: item.id,
          url: data.fileUrl,
          uploaded_by: 'Customer',
          uploaded_by_name: displayName,
          revision_type: 'INITIAL',
          upload_stats: {
            originalSize: formatBytes(data.originalSize),
            compressedSize: formatBytes(data.compressedSize),
            ratio: data.compressionRatio,
            filename: data.filename
          }
        });

      if (revError) throw revError;

      // 2. Update item status
      const { error: itemError } = await supabase
        .from('order_items')
        .update({
          designUrl: data.fileUrl,
          designStatus: 'UPLOADED_BY_CUSTOMER',
          itemWorkspace: {
            customerUploadUrl: data.fileUrl,
            customerUploadedAt: new Date().toISOString()
          },
          designUploadStats: {
            originalSize: formatBytes(data.originalSize),
            compressedSize: formatBytes(data.compressedSize),
            ratio: data.compressionRatio,
            filename: data.filename,
          },
        })
        .eq('id', item.id);

      if (itemError) throw itemError;

      // 3. Keep child order status updated
      await supabase
        .from('orders')
        .update({
          status: 'DESIGNING',
          updatedAt: new Date().toISOString()
        })
        .eq('id', orderId);

      toast.success(`Uploaded artwork for ${item.productName}`);
      onUploadSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Error uploading artwork');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative h-36 flex items-center justify-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-colors">
      <input type="file" onChange={handleUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10" />
      <div className="text-center space-y-2 pointer-events-none">
        {uploading ? (
          <Loader2 className="mx-auto text-blue-500 animate-spin" size={24} />
        ) : (
          <Upload className="mx-auto text-blue-500" size={24} />
        )}
        <p className="text-[11px] font-bold text-slate-500">
          {uploading ? 'Processing...' : 'Upload your artwork'}
        </p>
      </div>
    </div>
  );
}

export default function OrderTrackingPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, role, profile } = useAuth();
  const { effectiveUserId } = useEffectiveUser(profile?.uid);
  
  const [parentOrder, setParentOrder] = useState<any | null>(null);
  const [childOrders, setChildOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [productsData, setProductsData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [reuploadUrl, setReuploadUrl] = useState('');
  const [reuploadPending, setReuploadPending] = useState(false);
  const [reuploadError, setReuploadError] = useState<string | null>(null);
  const [reuploadSuccess, setReuploadSuccess] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [invoice, setInvoice] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [commentText, setCommentText] = useState('');
  const [commentPending, setCommentPending] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    try {
      // 1. Fetch main order matching the URL param `id`
      const { data: mainOrder, error: err } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (err || !mainOrder) {
        setError('Order not found');
        setLoading(false);
        return;
      }

      // Verify ownership if and only if the user is a CUSTOMER
      const isStaff = role && role !== 'CUSTOMER';
      if (effectiveUserId && !isStaff && mainOrder.customerId !== effectiveUserId) {
        setError('Unauthorized Access');
        setLoading(false);
        return;
      }

      // 2. Determine if this is a child order or standalone
      // Child orders store baseOrderId inside workflow.baseOrderId OR at top level
      const topLevelBaseId = (mainOrder as any).baseOrderId || mainOrder.workflow?.baseOrderId || null;
      const isChildOrder = !!topLevelBaseId;
      const parentId = topLevelBaseId || mainOrder.id;

      // 3. Fetch parent order (for financials)
      let parentOrderDoc = mainOrder;
      if (isChildOrder) {
        const { data: pDoc } = await supabase
          .from('orders')
          .select('*')
          .eq('id', parentId)
          .single();
        if (pDoc) parentOrderDoc = pDoc;
      }
      setParentOrder(parentOrderDoc);

      // 4. For child item pages: only show THIS child order in the workspace
      //    For parent/standalone pages: show all children
      let childrenList: any[] = [];
      if (isChildOrder) {
        // This URL IS a child item — scope workspace to just this item
        childrenList = [mainOrder];
      } else {
        const groupOrderIds = mainOrder.workflow?.groupOrderIds || [];
        if (groupOrderIds.length > 0) {
          const { data: cList } = await supabase
            .from('orders')
            .select('*')
            .in('id', groupOrderIds);
          if (cList) {
            childrenList = cList.sort((a, b) => groupOrderIds.indexOf(a.id) - groupOrderIds.indexOf(b.id));
          }
        } else {
          childrenList = [mainOrder];
        }
      }

      setChildOrders(childrenList);
      // Set default selected child ID to this order (for child pages) or first child
      setSelectedChildId(prev => {
        if (prev && childrenList.some(c => c.id === prev)) return prev;
        return childrenList[0]?.id || '';
      });

      // 5. Fetch order items for the displayed child orders only
      const orderIdsToFetch = childrenList.map(c => c.id);
      const { data: itemsList } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIdsToFetch.length > 0 ? orderIdsToFetch : [parentId]);

      if (itemsList) {
        setItems(itemsList);
        
        // Fetch products for descriptions
        const productIds = Array.from(new Set(itemsList.map(i => i.product_id || i.productId).filter(Boolean)));
        if (productIds.length > 0) {
          const { data: prods } = await supabase.from('products').select('*').in('id', productIds);
          if (prods) {
            const pMap: Record<string, any> = {};
            prods.forEach(p => pMap[p.id] = p);
            setProductsData(pMap);
          }
        }
      }
      setItemsLoading(false);

      const resInv = await fetch(`/api/invoices?parentOrderId=${parentId}&childOrderId=${id}&single=true`);
      const invoiceDoc = await resInv.json();
      
      setInvoice(invoiceDoc && !invoiceDoc.error ? invoiceDoc : null);

      // 7. Fetch payments
      const { data: payList } = await supabase
        .from('payments')
        .select('*')
        .eq('orderId', parentId);
      
      if (payList) {
        setPayments(payList);
      }
      setPaymentsLoading(false);

      // 8. Fetch activity logs / status logs
      const { data: logsList } = await supabase
        .from('activity_logs')
        .select('*')
        .or(`meta->>orderId.eq.${parentId},meta->>orderId.eq.${id}`);
      
      if (logsList) {
        const sortedLogs = [...logsList].sort((a: any, b: any) => {
          const tA = new Date(a.timestamp).getTime();
          const tB = new Date(b.timestamp).getTime();
          return tB - tA;
        });
        setLogs(sortedLogs);
      }
      setLogsLoading(false);

      // 9. Fetch comments
      const { data: commentsList } = await supabase
        .from('design_comments')
        .select('*')
        .in('order_id', orderIdsToFetch)
        .order('created_at', { ascending: true });
      
      if (commentsList) {
        setComments(commentsList);
      }

    } catch (e: any) {
      console.error("Fetch Details Error:", e);
      setError(e.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    
    fetchData();

    // Setup Supabase Realtime lightweight subscription
    const channel = supabase.channel(`order-details-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders'
      }, () => {
        fetchData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoices',
        filter: `parentOrderId=eq.${id}`
      }, () => {
        fetchData();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'design_comments'
      }, () => {
        // Just refresh comments
        if (parentOrder) {
          const groupOrderIds = parentOrder?.workflow?.groupOrderIds || [];
          const orderIdsToFetch = groupOrderIds.length > 0 ? groupOrderIds : [parentOrder?.id || id];
          supabase.from('design_comments')
            .select('*')
            .in('order_id', orderIdsToFetch)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              if (data) setComments(data);
            });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user?.uid, role, parentOrder?.id]);

  const handleApproveDesign = async () => {
    if (!selectedChildId) return;
    setRejectError(null);
    startTransition(async () => {
      try {
        await refreshAuthTokenCookie();
        await customerApproveDesign(selectedChildId);
        toast.success('Design proof approved!');
        fetchData();
      } catch (err: any) {
        setRejectError(err.message || 'Failed to approve design.');
        toast.error(err.message || 'Failed to approve design.');
      }
    });
  };

  const handleRejectDesign = async () => {
    if (!selectedChildId) return;
    if (!rejectNotes.trim()) {
      setRejectError('Please provide a reason for rejection.');
      return;
    }
    setRejectError(null);
    startTransition(async () => {
      try {
        await refreshAuthTokenCookie();
        await customerRejectDesign(selectedChildId, rejectNotes);
        setShowRejectForm(false);
        setRejectNotes('');
        toast.success('Redesign request submitted.');
        fetchData();
      } catch (err: any) {
        setRejectError(err.message || 'Failed to reject design.');
      }
    });
  };

  const handleReuploadSubmit = async () => {
    if (!selectedChildId) return;
    if (!reuploadUrl.trim()) {
      setReuploadError('Please provide a Google Drive design link.');
      return;
    }
    setReuploadError(null);
    setReuploadSuccess(null);
    setReuploadPending(true);
    try {
      await refreshAuthTokenCookie();
      await customerReuploadDesign(selectedChildId, reuploadUrl);
      setReuploadSuccess('Corrected design submitted successfully! The design step will be updated.');
      setReuploadUrl('');
      fetchData();
    } catch (err: any) {
      setReuploadError(err.message || 'Failed to submit corrected design.');
    } finally {
      setReuploadPending(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedChildId) return;
    setCommentPending(true);
    try {
      const activeItem = items.find(i => i.orderId === selectedChildId || i.order_id === selectedChildId);
      const { error } = await supabase
        .from('design_comments')
        .insert({
          order_id: selectedChildId,
          item_id: activeItem?.id || 'unknown',
          message: commentText.trim(),
          author_id: user?.uid || 'anonymous',
          author_name: profile?.displayName || profile?.name || 'Customer',
          author_role: role || 'CUSTOMER'
        });
      if (error) throw error;
      setCommentText('');
      toast.success('Comment posted successfully');
      
      const groupOrderIds = parentOrder?.workflow?.groupOrderIds || [];
      const orderIdsToFetch = groupOrderIds.length > 0 ? groupOrderIds : [parentOrder?.id || id];
      const { data } = await supabase
        .from('design_comments')
        .select('*')
        .in('order_id', orderIdsToFetch)
        .order('created_at', { ascending: true });
      if (data) setComments(data);
    } catch (err: any) {
      toast.error('Failed to post comment: ' + err.message);
    } finally {
      setCommentPending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-teal-600" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-teal-600/40">Securing Live Feed...</p>
      </div>
    );
  }

  if (error || !parentOrder) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <AlertCircle className="text-red-500 mb-4" size={40} />
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-orange-500">
          {error || 'Trace Not Found'}
        </h2>
        <p className="text-slate-400 mt-2">
          {error === 'Unauthorized Access'
            ? 'You do not have permission to view this order.'
            : 'The order ID provided does not match our records or has been archived.'}
        </p>
        <Link href="/dashboard/orders" className="mt-8 text-blue-600 font-bold border-b border-blue-600">Back to History</Link>
      </div>
    );
  }

  // Active Child Order Context
  const activeChild = childOrders.find(c => c.id === selectedChildId) || childOrders[0] || parentOrder;
  const activeItem = items.find(i => i.orderId === activeChild.id || i.order_id === activeChild.id);

  // Status index for timeline matching active child order
  const currentMilestoneId = statusToMilestone[activeChild.status] || 'PLACED';
  const currentStep = MILESTONES.findIndex(m => m.id === currentMilestoneId);

  // Active child workflow snapshots
  const proofVersions = Array.isArray(activeChild.workflow?.designerProofs) ? activeChild.workflow?.designerProofs : [];
  const activeProofVersion = activeChild.workflow?.customerApproval?.currentProofVersion || 0;
  const activeProof = proofVersions.find((p: any) => p?.version === activeProofVersion) || proofVersions[proofVersions.length - 1] || null;
  const designerStep = activeChild.workflowSnapshot?.steps?.find((s: any) => s.role === 'DESIGNER');
  const designerAttachments = designerStep?.attachments || [];
  const latestDesignerAttachment = designerAttachments[designerAttachments.length - 1] || null;
  const rawDesignUrl = activeProof?.url || activeChild.workflow?.designUrl || activeChild.workflowSnapshot?.metadata?.designUrl || latestDesignerAttachment || '';
  const designUrl = (rawDesignUrl.includes('images.unsplash.com') || rawDesignUrl.includes('unsplash.com') || rawDesignUrl === 'DESIGN_BY_US') ? '' : rawDesignUrl;
  
  const customerOriginalUrl = activeItem?.itemWorkspace?.customerUploadUrl || activeItem?.fileUrl || activeChild.workflow?.customerDesignUrl || activeChild.thumbnailUrl || '';
  const designerCorrectedUrl = activeItem?.itemWorkspace?.designerUploadUrl || (activeItem?.designUrl && activeItem.designUrl !== activeItem.fileUrl ? activeItem.designUrl : '') || activeChild.workflow?.designUrl || '';
  const isCustomerOriginalRealImage = !!customerOriginalUrl && customerOriginalUrl !== 'DESIGN_BY_US' && !customerOriginalUrl.includes('unsplash.com');
  const sortedProofs = Array.isArray(activeChild.workflow?.designerProofs) ? [...activeChild.workflow.designerProofs].sort((a: any, b: any) => a.version - b.version) : [];
  const isRejectedProofExisting = sortedProofs.length > 1;
  const previousDesignerUrl = isRejectedProofExisting ? sortedProofs[sortedProofs.length - 2]?.url : null;

  let leftBannerTitle = '';
  let leftBannerUrl = '';
  let rightBannerTitle = '';
  let rightBannerUrl = '';
  let showSplitBanner = false;

  if (isRejectedProofExisting && previousDesignerUrl) {
    showSplitBanner = true;
    leftBannerTitle = "PREVIOUS DESIGN (NOT APPROVED)";
    leftBannerUrl = previousDesignerUrl;
    rightBannerTitle = "NEW CORRECTED DESIGN";
    rightBannerUrl = designerCorrectedUrl;
  } else if (isCustomerOriginalRealImage && designerCorrectedUrl && designerCorrectedUrl !== customerOriginalUrl) {
    showSplitBanner = true;
    leftBannerTitle = "ORIGINAL CUSTOMER UPLOAD";
    leftBannerUrl = customerOriginalUrl;
    rightBannerTitle = "CORRECTED DESIGN VERSION";
    rightBannerUrl = designerCorrectedUrl;
  }

  const dispatchMethodKey = parentOrder.dispatchInfo?.method || parentOrder.delivery?.choice || 'COUNTER';
  const dispatchMethod = dispatchMethodKey.replace(/_/g, ' ');
  const orderDate = parseTimestamp(parentOrder.createdAt);
  const dispatchedAtDate = parseTimestamp(parentOrder.dispatchInfo?.dispatchedAt);

  const displayDisplayName = profile?.displayName || profile?.name || 'Customer';

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-32 animate-in fade-in duration-500">
      {/* Top Navigation */}
      <section className="flex items-center justify-between">
        <Link
          href={role === 'CUSTOMER' ? "/dashboard/orders" : "/admin/orders"}
          className="group flex items-center gap-3 text-slate-400 hover:text-slate-900 transition-all font-black text-[10px] uppercase tracking-widest"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all">
            <ChevronLeft size={16} />
          </div>
          {role === 'CUSTOMER' ? 'Back to History' : 'Back to Global Orders'}
        </Link>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Parent Order Reference</p>
          <h2 className="text-xl font-black text-slate-900 tracking-tight italic">Order #{parentOrder.id.replace('ORD-', '')}</h2>
        </div>
      </section>

      {/* Main Layout: Administrative Financials and Child Workspaces */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* LEFT COLUMN: Main content area */}
        <div className="w-full lg:w-[75%] space-y-8">
          
          {/* ARTWORK TOP DISPLAY */}
          {showSplitBanner ? (
            <section className="bg-white rounded-[2rem] border border-emerald-100 shadow-xl overflow-hidden p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">{leftBannerTitle}</h3>
                  <div className="aspect-[4/3] w-full rounded-2xl border-2 border-slate-100 overflow-hidden bg-slate-50 relative group flex items-center justify-center">
                     {leftBannerUrl ? (
                       <img src={leftBannerUrl} alt={leftBannerTitle} className="w-full h-full object-contain" />
                     ) : (
                       <span className="text-slate-400 text-xs font-black uppercase tracking-widest">No Preview</span>
                     )}
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">{rightBannerTitle}</h3>
                  <div className="aspect-[4/3] w-full rounded-2xl border-2 border-emerald-100 overflow-hidden bg-emerald-50/20 relative group flex items-center justify-center">
                     {rightBannerUrl && !rightBannerUrl.includes('images.unsplash.com') && !rightBannerUrl.includes('unsplash.com') ? (
                       <img src={rightBannerUrl} alt={rightBannerTitle} className="w-full h-full object-contain" />
                     ) : (
                       <div className="text-center text-emerald-600/50 p-6">
                         <span className="text-[10px] font-black uppercase tracking-widest">No valid image found</span>
                       </div>
                     )}
                  </div>
                </div>
              </div>
            </section>
          ) : (customerOriginalUrl || designerCorrectedUrl) ? (
            <section className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden p-8">
              <div className="flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">DESIGN ARTWORK</h3>
                <div className="w-full max-w-lg mx-auto aspect-[4/3] rounded-2xl border-2 border-slate-100 overflow-hidden bg-slate-50 relative group flex items-center justify-center">
                   {(!designerCorrectedUrl && customerOriginalUrl === 'DESIGN_BY_US') ? (
                     <div className="text-center">
                       <span className="text-4xl mb-2 animate-bounce inline-block">✨</span>
                       <h3 className="text-[14px] font-black text-blue-900 uppercase tracking-widest leading-none">Design By Us</h3>
                     </div>
                   ) : (
                     <img src={designerCorrectedUrl || customerOriginalUrl} alt="Artwork" className="w-full h-full object-contain" />
                   )}
                </div>
              </div>
            </section>
          ) : null}

          {/* === MOVED PROOF APPROVAL & REUPLOAD ACTIONS === */}
          {(activeChild.status === 'CUSTOMER_APPROVAL_PENDING' || activeChild.workflow?.customerApproval?.status === 'PENDING') && (
            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-xl mt-[-1rem]">
              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px] text-purple-800">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
                    </span>
                    <span>Corrected Design Version Generated (Awaiting Customer Verification)</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    A corrected proof version has been generated by the design desk for your approval. Please review the artwork displayed at the top of the page and confirm production clearance below:
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  {!showRejectForm && (
                    <div className="flex gap-4 justify-end">
                      <button
                        onClick={() => setShowRejectForm(true)}
                        disabled={isPending}
                        className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2"
                      >
                        <XCircle size={14} /> Request Correction
                      </button>
                      <button
                        onClick={handleApproveDesign}
                        disabled={isPending}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-4 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg shadow-teal-500/20 transition-all flex items-center gap-2"
                      >
                        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Approve & Print
                      </button>
                    </div>
                  )}

                  {showRejectForm && (
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/60 mt-2 animate-in fade-in slide-in-from-top-4 space-y-4">
                      <h5 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Rejection / Revision Requirements</h5>
                      {rejectError && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-center gap-2">
                          <AlertCircle size={14} />
                          <p>{rejectError}</p>
                        </div>
                      )}
                      <textarea
                        value={rejectNotes}
                        onChange={(e) => setRejectNotes(e.target.value)}
                        placeholder="Describe what changes are required in the artwork..."
                        rows={3}
                        className="w-full border border-slate-200 rounded-xl p-4 text-xs outline-none bg-white resize-none shadow-inner"
                      />
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => {
                            setShowRejectForm(false);
                            setRejectError(null);
                            setRejectNotes('');
                          }}
                          disabled={isPending}
                          className="px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleRejectDesign}
                          disabled={isPending}
                          className="px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-md"
                        >
                          {isPending && <Loader2 size={12} className="animate-spin" />}
                          Submit Feedback
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeChild.status === 'DESIGNING' && activeChild.workflow?.customerRevisionRequired === true && (
            <div className="space-y-6 bg-amber-50/50 border border-amber-200 p-6 rounded-[2rem] shadow-xl mt-[-1rem]">
              <div className="flex items-start gap-4">
                <AlertCircle className="text-amber-600 mt-1 shrink-0" size={24} />
                <div className="space-y-1">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">Redesign/Correction Required</h4>
                  <p className="text-xs text-slate-500">The design studio has requested artwork revisions before processing:</p>
                  {activeChild.workflow?.redesignNotes && (
                    <div className="bg-white/60 p-4 rounded-xl border border-amber-100 text-xs font-medium text-slate-700 mt-2">
                      "{activeChild.workflow.redesignNotes}"
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-amber-100 space-y-4">
                <h5 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Provide Corrected Design Link</h5>
                {reuploadError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle size={14} />
                    <p>{reuploadError}</p>
                  </div>
                )}
                {reuploadSuccess && (
                  <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-green-700 text-xs flex items-center gap-2">
                    <CheckCircle2 size={14} />
                    <p>{reuploadSuccess}</p>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="Paste new Google Drive design link..."
                    value={reuploadUrl}
                    onChange={(e) => setReuploadUrl(e.target.value)}
                    disabled={reuploadPending}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50 disabled:opacity-75"
                  />
                  <button
                    onClick={handleReuploadSubmit}
                    disabled={reuploadPending || !reuploadUrl.trim()}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-black text-[10px] uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2"
                  >
                    {reuploadPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Submit Link
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PARENT ORDER ADMINISTRATIVE CARD */}
          <section className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
             <div className="bg-slate-50 px-8 py-4 border-b border-slate-100">
               <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 italic flex items-center gap-3">
                 <Package size={14} className="text-teal-600" /> Administrative Summary
               </h3>
             </div>
             
             <div className="divide-y divide-slate-100">
                {/* Row: Order ID — show THIS child's ID if it's a child item */}
                <div className="grid grid-cols-1 md:grid-cols-3">
                   <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b md:border-b-0 md:border-r border-slate-100">Order ID</div>
                   <div className="col-span-2 px-8 py-5">
                     <span className="text-sm font-black text-slate-900">{(childOrders[0]?.id || (id as string))}</span>
                     {(childOrders[0] as any)?.baseOrderId && (
                       <span className="ml-3 text-[10px] font-bold text-slate-400 italic">Part of Group #{((childOrders[0] as any).baseOrderId || '').replace('ORD-','')}</span>
                     )}
                   </div>
                </div>

                {/* Row: Product — show only THIS item's product */}
                <div className="grid grid-cols-1 md:grid-cols-3">
                   <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b md:border-b-0 md:border-r border-slate-100">Product</div>
                   <div className="col-span-2 px-8 py-5 text-sm font-black text-slate-900">
                     {items.length > 0 ? items[0].productName : (childOrders[0]?.productName || activeChild?.productName || '—')}
                   </div>
                </div>
  
                {/* Row: Description */}
                 <div className="grid grid-cols-1 md:grid-cols-3">
                    <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b md:border-b-0 md:border-r border-slate-100">Description</div>
                    <div className="col-span-2 px-8 py-6 flex flex-col gap-8">
                       {items.map((item, idx) => {
                          const isDesignByUs = item.fileUrl === 'DESIGN_BY_US';
                          const rawFileUrl = item.fileUrl || '';
                          const hasValidFile = rawFileUrl && !rawFileUrl.includes('images.unsplash.com') && !rawFileUrl.includes('unsplash.com') && rawFileUrl !== 'DESIGN_BY_US';
                          const designUrl = item.designUrl || '';
                          const isPendingApproval = item.designStatus === 'CUSTOMER_REVIEW';
                          const isDesignApproved = item.designStatus === 'APPROVED';
                          
                          const productData = productsData[item.product_id || item.productId];
                          const productDescription = productData?.description || item.description || item.specs?.description;
                          
                          return (
                            <div key={idx} className="flex flex-col sm:flex-row gap-6 items-start border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                              <div className="flex-1 flex flex-col gap-2 pt-2 pr-4 pl-4">
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{item.product_name || item.productName || 'Product'}</h3>
                                {productDescription ? (
                                  <p className="text-sm text-slate-500 leading-relaxed font-medium mt-1">
                                    {productDescription}
                                  </p>
                                ) : (
                                  <p className="text-sm text-slate-400 italic mt-1">No detailed description available for this item.</p>
                                )}
                              </div>
                            </div>
                          );
                       })}
                    </div>
                 </div>

                {/* Delivery and Tax Invoice */}
                <div className="grid grid-cols-1 md:grid-cols-3">
                   <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b md:border-b-0 md:border-r border-slate-100">Delivery | Status</div>
                   <div className="col-span-2 flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                      <div className="flex-1 p-6 flex flex-col gap-1 bg-white">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment</span>
                        <span className={`text-sm font-black uppercase tracking-wider px-3 py-1 mt-1 rounded-full border w-fit ${
                          parentOrder.paymentStatus === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse'
                        }`}>
                          {parentOrder.paymentStatus || 'PENDING'}
                        </span>
                      </div>
                      <div className="flex-1 p-6 flex flex-col gap-1 bg-white">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tax Invoice</span>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                            invoice
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : 'bg-amber-50 text-amber-600 border-amber-200'
                          }`}>
                            {invoice ? 'Available' : 'Pending'}
                          </span>
                          {invoice && (
                            <a
                              href={`/dashboard/documents/invoice/${invoice.id}/print`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] font-black text-teal-600 uppercase tracking-wider hover:underline"
                            >
                              <Download size={14} /> Download
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 p-6 flex flex-col gap-1 bg-white">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Dispatch Choice</span>
                        <span className="text-sm font-black text-slate-500 uppercase mt-1">{dispatchMethod || 'Pending'}</span>
                      </div>
                   </div>
                </div>
  
                {/* Row: Financial Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3">
                   <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b md:border-b-0 md:border-r border-slate-100 flex items-center">Total Amount View</div>
                   <div className="col-span-2 grid grid-cols-1 divide-y divide-slate-100 font-display">
                      <div className="flex justify-between px-8 py-4 bg-white">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Printing Cost:</span>
                        <span className="text-sm font-black text-slate-900">₹{(parentOrder.amounts?.base || ((parentOrder.amounts?.grandTotal || 0) - (parentOrder.amounts?.gst || 0) - (parentOrder.amounts?.transport || parentOrder.amounts?.transportCharges || parentOrder.amounts?.logistics || 0) + Math.abs(parentOrder.amounts?.voucherDiscount || parentOrder.amounts?.extras || 0))).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between px-8 py-4 bg-slate-50/20">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Membership Discount:</span>
                        <span className="text-sm font-black text-red-500">- ₹{Math.abs(parentOrder.amounts?.voucherDiscount || parentOrder.amounts?.extras || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between px-8 py-4 bg-white">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sub Total:</span>
                        <span className="text-sm font-black text-slate-900">₹{((parentOrder.amounts?.base || ((parentOrder.amounts?.grandTotal || 0) - (parentOrder.amounts?.gst || 0) - (parentOrder.amounts?.transport || parentOrder.amounts?.transportCharges || parentOrder.amounts?.logistics || 0) + Math.abs(parentOrder.amounts?.voucherDiscount || parentOrder.amounts?.extras || 0))) - Math.abs(parentOrder.amounts?.voucherDiscount || parentOrder.amounts?.extras || 0)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between px-8 py-4 bg-slate-50/20">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tax (GST 18%):</span>
                        <span className="text-sm font-black text-slate-900">₹{(parentOrder.amounts?.gst || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between px-8 py-4 bg-white">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logistics Amount:</span>
                        <span className="text-sm font-black text-slate-900">₹{(parentOrder.amounts?.transport || parentOrder.amounts?.transportCharges || parentOrder.amounts?.logistics || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between px-8 py-4 bg-slate-50/20">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Charity / Other:</span>
                        <span className="text-sm font-black text-slate-900">₹0.00</span>
                      </div>
                      <div className="flex justify-between px-8 py-4 bg-white">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Round Off:</span>
                        <span className="text-sm font-black text-slate-900">₹0.00</span>
                      </div>
                      <div className="flex justify-between px-8 py-6 bg-slate-900 text-white rounded-b-[2rem] md:rounded-br-[2rem] border-t-2 border-slate-900">
                        <span className="text-[11px] font-black text-blue-400 uppercase tracking-widest flex items-center">Total Amount Paid:</span>
                        <span className="text-2xl font-black text-blue-400 italic">₹{(parentOrder.amounts?.grandTotal || 0).toFixed(2)}</span>
                      </div>
                   </div>
                </div>
             </div>
          </section>

          {/* LEDGER ENTRIES CARD */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
            <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50/50">
              <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <h2 className="text-[11px] font-black text-slate-700 uppercase tracking-widest italic">Ledger Journal & Activity Stream</h2>
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-5 text-[10px] font-black text-slate-400 uppercase tracking-widest p-6 border-b border-slate-100 bg-slate-50/30">
                <div>Order Status</div>
                <div>Delivery Choice</div>
                <div>Updated By</div>
                <div>Verified On</div>
                <div>Remarks</div>
              </div>
              <div className="divide-y divide-slate-100">
                {logs.length > 0 ? (
                  logs.map((log, idx) => (
                    <div key={idx} className="grid grid-cols-5 items-center p-6 text-sm hover:bg-slate-50/30 transition-colors">
                      <div className="tabular-nums">
                        <span className="px-3 py-1 bg-slate-100 text-slate-900 text-[9px] font-black uppercase tracking-widest rounded-full">
                          {log.meta?.nextStatus || log.action || 'Event Logged'}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-400 tabular-nums">
                        {dispatchMethod || 'N/A'}
                      </div>
                      <div className="tabular-nums flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-black shrink-0">
                          {log.userRole?.charAt(0) || 'U'}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                          {log.userRole || 'USER'}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-500 tabular-nums">
                        {formatLogDate(log.timestamp)}
                      </div>
                      <div className="text-[10px] font-black text-slate-400 italic tracking-tighter tabular-nums truncate pr-4">
                        {log.meta?.remarks || '—'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center flex items-center justify-center">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">
                      Initial capture complete. Log stream active.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TABBED CHILD WORKSPACE */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-md font-black uppercase tracking-[0.15em] text-slate-900 italic">Independent Item Workspaces</h3>
              <span className="text-[10px] font-black text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">
                {childOrders.length} {childOrders.length === 1 ? 'Job' : 'Jobs'} Active
              </span>
            </div>

            {/* Child items selector tabs */}
            {childOrders.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {childOrders.map((child, idx) => {
                  const isActive = child.id === selectedChildId;
                  const item = items.find(i => i.orderId === child.id || i.order_id === child.id);
                  return (
                    <button
                      key={child.id}
                      onClick={() => setSelectedChildId(child.id)}
                      className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 translate-y-[-2px]'
                          : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-sm'
                      }`}
                    >
                      Item {idx + 1}: {item?.productName || child.productName || 'Printing Item'}
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 text-[9px] font-bold">
                        {child.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ACTIVE WORKSPACE CARD */}
            <div className="space-y-6">
              
              {/* Timeline status for active child */}
              <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Active Job Status</span>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{activeItem?.productName || activeChild.productName}</h4>
                </div>
                <div className="flex items-center gap-3">
                  {activeItem?.assignedPrinterName && (
                    <div className="text-right hidden sm:block">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Assigned Printer</p>
                      <p className="text-xs font-bold text-slate-600">{activeItem.assignedPrinterName}</p>
                    </div>
                  )}
                  <span className="text-xs font-black uppercase tracking-widest bg-teal-50 text-teal-600 border border-teal-100 px-4 py-2 rounded-full">
                    {activeChild.status}
                  </span>
                </div>
              </div>

              {/* Designer Workspace, Proof Approval & Re-upload */}
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-6">
                
                {/* 1. Normal Workspace Preview */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-black uppercase tracking-wider text-slate-900">Artwork Design Preview</h5>
                      <span className="text-[9px] font-bold uppercase text-slate-400">
                        Type: {activeItem?.designType || 'Direct Upload'}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden relative group">
                      {designUrl ? (
                        <div className="h-64 flex items-center justify-center relative bg-slate-950/5">
                          {/\.(png|jpg|jpeg|webp|gif)$/i.test(designUrl) ? (
                            <>
                              <img src={designUrl} alt="Active Design Preview" className="h-full object-contain max-w-full" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <a href={designUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-slate-900 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-slate-100">
                                  <ExternalLink size={12} /> Full Size View
                                </a>
                              </div>
                            </>
                          ) : (
                            <div className="text-center p-4">
                              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2 animate-pulse" />
                              <a href={designUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline">
                                View Design File (PDF / Document)
                              </a>
                            </div>
                          )}
                        </div>
                      ) : activeChild.status === 'PLACED' && activeItem?.designType === 'CUSTOMER_DESIGN' && !customerOriginalUrl ? (
                        <div className="p-8">
                          <CustomerDesignUpload
                            orderId={activeChild.id}
                            item={activeItem}
                            onUploadSuccess={fetchData}
                            displayName={displayDisplayName}
                          />
                        </div>
                      ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-2">
                          {customerOriginalUrl ? (
                            <>
                              <FileText className="w-12 h-12 text-slate-300" />
                              <p className="text-xs font-bold text-slate-600">Original Artwork Uploaded</p>
                              <a href={customerOriginalUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline font-bold uppercase tracking-wider flex items-center gap-1">
                                View Original <ExternalLink size={10} />
                              </a>
                            </>
                          ) : (
                            <>
                              <ImageIcon size={32} />
                              <p className="text-xs font-bold">No Layout Preview Available Yet</p>
                              <p className="text-[10px] text-slate-400">Design team is currently setting up the digital canvas.</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
              </div>

              {/* COMMENTS BOARD FOR ACTIVE CHILD */}
              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-6">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">Job Discussion & Revision Log</h4>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5">Communicate directly with the assigned designer for this item.</p>
                </div>

                {/* Comment Feed */}
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {comments.filter(c => c.order_id === selectedChildId).length > 0 ? (
                    comments.filter(c => c.order_id === selectedChildId).map((c) => {
                      const isMe = c.author_id === user?.uid;
                      return (
                        <div key={c.id} className={`flex flex-col space-y-1 p-4 rounded-2xl max-w-[85%] border ${
                          isMe 
                            ? 'bg-slate-900 border-slate-800 text-white ml-auto' 
                            : 'bg-slate-50 border-slate-100 text-slate-800 mr-auto'
                        }`}>
                          <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-wider opacity-60">
                            <span>{c.author_name} ({c.author_role})</span>
                            <span>{formatLogDate(c.created_at)}</span>
                          </div>
                          <p className="text-xs font-medium leading-relaxed">{c.message}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-400 italic text-xs">
                      No design comments or discussion logged for this item yet.
                    </div>
                  )}
                </div>

                {/* Post Comment Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Type review comment or request adjustments..."
                    disabled={commentPending}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-xs outline-none bg-slate-50 focus:bg-white"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={commentPending || !commentText.trim()}
                    className="bg-slate-900 hover:bg-slate-800 text-white p-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    {commentPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Real-Time Timeline and Help Center */}
        <div className="w-full lg:w-[25%] space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-8 flex flex-col relative">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur z-10">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 italic border-b-2 border-teal-500 pb-1">
                Active Job Timeline
              </h3>
            </div>

            <div className="relative space-y-8 pl-2">
              <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-slate-100" />

              {(() => {
                const isDeliverySkipped = ['pickup', 'transport', 'courier', 'counter'].includes((dispatchMethodKey || '').toLowerCase());
                const displayMilestones = isDeliverySkipped ? MILESTONES.filter(m => m.id !== 'DELIVERED') : MILESTONES;
                return displayMilestones.map((milestone, idx) => {
                  const isDeliveredFinal = milestone.id === 'DELIVERED' && activeChild.status === 'DELIVERED';
                  const isPaymentMilestone = milestone.id === 'PAYMENT_VERIFIED';
                  const isCompleted = activeChild.status === 'DELIVERED' ? true : idx < currentStep;
                  const isCurrent = !isDeliveredFinal && idx === currentStep && activeChild.status !== 'DELIVERED';
                  const isUpcoming = !isDeliveredFinal && idx > currentStep && activeChild.status !== 'DELIVERED';
                  
                  const isVerifiedPaymentStep = isPaymentMilestone && (parentOrder.paymentStatus === 'VERIFIED' || activeChild.status === 'PAYMENT_VERIFIED');

                  return (
                    <div key={milestone.id} className={`relative flex items-start gap-6 transition-all duration-500 ${isUpcoming ? 'opacity-40' : 'opacity-100'}`}>
                      <div className={`relative z-10 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isVerifiedPaymentStep 
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40' 
                          : isDeliveredFinal 
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40' 
                            : isCompleted 
                              ? 'bg-teal-600 text-white shadow-lg' 
                              : isCurrent 
                                ? 'bg-teal-500 text-white shadow-lg animate-pulse' 
                                : 'bg-slate-50 border border-slate-200 text-slate-400'
                      }`}>
                        {(isCompleted || isDeliveredFinal || isVerifiedPaymentStep) ? <CheckCircle2 size={16} strokeWidth={3} /> : React.cloneElement(milestone.icon as React.ReactElement, { size: 16 })}
                      </div>

                      <div className="flex-1 pt-0.5">
                        <div className="flex items-center justify-between">
                          <h4 className={`text-xs font-black tracking-tight uppercase ${
                            isVerifiedPaymentStep ? 'text-emerald-600' : isDeliveredFinal ? 'text-emerald-600' : isCurrent ? 'text-teal-600' : 'text-slate-800'
                          }`}>{milestone.label}</h4>
                          {isCurrent && (
                            <span className="text-[7px] font-black uppercase text-teal-600 tracking-widest flex items-center gap-1.5 bg-teal-50 px-2 py-0.5 rounded-full">
                              <Circle size={6} fill="currentColor" className="animate-ping" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 mt-1 leading-relaxed">{milestone.description}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="p-8 border border-dashed border-slate-200 rounded-[2.5rem] text-center bg-white/50 backdrop-blur">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Questions about progress?</p>
            <button className="text-[10px] font-black text-teal-600 uppercase tracking-widest border-b-2 border-teal-600 pb-1 hover:text-slate-900 hover:border-slate-900 transition-all">Speak to Floor Manager</button>
          </div>
        </div>
      </div>
    </div>
  );
}

