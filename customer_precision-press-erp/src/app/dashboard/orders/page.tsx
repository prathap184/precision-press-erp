'use client';


import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, getDoc, doc, limit, getCountFromServer } from '@/lib/supabase-firestore-shim';
import { Order, OrderItem } from '@/types/models';
import Link from 'next/link';
import {
  ShoppingCart, Clock, CheckCircle, Truck, Loader2,
  ChevronRight, Package, Plus, Search, AlertCircle,
  Printer, Palette, Zap, ArrowRight, FileText,
  Image as ImageIcon, Activity, CreditCard,
  IndianRupee, ThumbsUp, ThumbsDown, Sparkles, X
} from 'lucide-react';
import { toast } from 'sonner';
import { customerApproveDesign, customerRejectDesign } from '@/lib/workflow';

// Status badge config
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PLACED:                    { label: 'Order Placed',           color: 'bg-blue-50 text-blue-600 border-blue-200',          icon: <ShoppingCart size={12} /> },
  DESIGNING:                 { label: 'Designing',               color: 'bg-purple-50 text-purple-600 border-purple-200',    icon: <Palette size={12} /> },
  CUSTOMER_APPROVAL_PENDING: { label: 'Awaiting Your Approval', color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-300', icon: <Sparkles size={12} /> },
  DESIGN_READY:              { label: 'Design Ready',            color: 'bg-indigo-50 text-indigo-600 border-indigo-200',    icon: <Zap size={12} /> },
  PAYMENT_PENDING:           { label: 'Payment Pending',         color: 'bg-yellow-50 text-yellow-600 border-yellow-200',    icon: <AlertCircle size={12} /> },
  PAYMENT_VERIFIED:          { label: 'Payment Verified',        color: 'bg-teal-50 text-teal-600 border-teal-200',          icon: <CheckCircle size={12} /> },
  ASSIGNED:                  { label: 'Assigned to Press',       color: 'bg-orange-50 text-orange-600 border-orange-200',    icon: <Printer size={12} /> },
  IN_PROGRESS:               { label: 'In Production',           color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Loader2 size={12} className="animate-spin" /> },
  COMPLETED:                 { label: 'Completed',               color: 'bg-green-50 text-green-600 border-green-200',       icon: <CheckCircle size={12} /> },
  DISPATCHED:                { label: 'Dispatched',              color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Truck size={12} /> },
  DELIVERED:                 { label: 'Delivered',               color: 'bg-green-50 text-green-600 border-green-200',       icon: <CheckCircle size={12} /> },
  CANCELLED:                 { label: 'Cancelled',               color: 'bg-red-50 text-red-500 border-red-200',             icon: <AlertCircle size={12} /> },
};

const PROGRESS: Record<string, number> = {
  PLACED: 10, DESIGNING: 30, CUSTOMER_APPROVAL_PENDING: 38, DESIGN_READY: 45,
  PAYMENT_PENDING: 50, PAYMENT_VERIFIED: 60,
  ASSIGNED: 70, IN_PROGRESS: 85, COMPLETED: 100, DISPATCHED: 100, DELIVERED: 100,
};


import { OrderThumbnail } from '@/components/orders/OrderThumbnail';

export default function CustomerOrdersPage() {
  const { profile } = useAuth();
  const { effectiveUserId, isImpersonating, simulatedUser } = useEffectiveUser(profile?.uid);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [limitCount, setLimitCount] = useState(5);
  const [hasMore, setHasMore] = useState(true);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, completed: 0 });
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ orderId: string; designUrl?: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Fetch true stats
  useEffect(() => {
    if (!effectiveUserId) return;
    const fetchStats = async () => {
      try {
        const baseQ = query(collection(db, 'orders'), where('customerId', '==', effectiveUserId));
        const totalSnap = await getCountFromServer(baseQ);
        const activeQ = query(collection(db, 'orders'), where('customerId', '==', effectiveUserId), where('status', 'in', ['PLACED', 'DESIGNING', 'DESIGN_READY', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'ASSIGNED', 'IN_PROGRESS']));
        const activeSnap = await getCountFromServer(activeQ);
        const completedQ = query(collection(db, 'orders'), where('customerId', '==', effectiveUserId), where('status', 'in', ['COMPLETED', 'DISPATCHED', 'DELIVERED']));
        const completedSnap = await getCountFromServer(completedQ);
        setTotalStats({ total: totalSnap.data().count, active: activeSnap.data().count, completed: completedSnap.data().count });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };
    fetchStats();
  }, [effectiveUserId]);

  // Fetch paginated list — we load more than needed so we can client-filter parent umbrella orders
  useEffect(() => {
    if (!effectiveUserId) return;

    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', effectiveUserId),
      orderBy('createdAt', 'desc'),
      limit(limitCount * 3) // load extra to compensate for filtered-out parent orders
    );

    const unsub = onSnapshot(q, (snap) => {
      const allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
      // Collect all IDs that are a baseOrderId of some other order (umbrella/parent orders)
      const baseOrderIdSet = new Set(allOrders.map(o => (o as any).baseOrderId).filter(Boolean));
      // Show child orders (have baseOrderId) + standalone single-item orders (no baseOrderId AND no groupOrderIds)
      const visible = allOrders.filter(o => {
        const hasBaseOrderId = !!(o as any).baseOrderId; // it IS a child item
        const isUmbrellaParent = baseOrderIdSet.has(o.id);   // its ID is used as baseOrderId by others
        const hasGroupChildren = Array.isArray((o as any).workflow?.groupOrderIds) && (o as any).workflow.groupOrderIds.length > 0;
        if (hasBaseOrderId) return true;           // always show child items
        if (isUmbrellaParent || hasGroupChildren) return false; // hide umbrella parents
        return true;                               // standalone single-item order
      });
      setOrders(visible);
      setHasMore(snap.docs.length === limitCount * 3);
      setLoading(false);
    });

    return () => unsub();
  }, [effectiveUserId, limitCount]);

  // For child orders, fetch parent's grandTotal so we can display it
  const [parentTotals, setParentTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchParentTotals = async () => {
      const missingBaseIds = orders
        .map(o => (o as any).baseOrderId)
        .filter((id): id is string => !!id && !parentTotals[id]);

      if (missingBaseIds.length === 0) return;

      const uniqueBaseIds = Array.from(new Set(missingBaseIds));
      const newTotals = { ...parentTotals };

      await Promise.all(uniqueBaseIds.map(async (baseId) => {
        try {
          const snap = await getDoc(doc(db, 'orders', baseId));
          if (snap.exists()) {
            const parentData = snap.data();
            newTotals[baseId] = parentData?.amounts?.grandTotal ?? 0;
          }
        } catch (e) {
          console.error(e);
        }
      }));

      setParentTotals(newTotals);
    };

    fetchParentTotals();
  }, [orders]);

  const filtered = orders.filter(o =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.status?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = totalStats;

  const handleApprove = async (orderId: string) => {
    setApprovalLoading(orderId);
    try {
      await customerApproveDesign(orderId);
      toast.success('Design approved! Your order is now moving to production.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve design.');
    } finally {
      setApprovalLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectNotes.trim()) return;
    setApprovalLoading(rejectModal.orderId);
    try {
      await customerRejectDesign(rejectModal.orderId, rejectNotes);
      toast.success('Feedback sent. The designer will revise the design.');
      setRejectModal(null);
      setRejectNotes('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit rejection.');
    } finally {
      setApprovalLoading(null);
    }
  };

  return (
    <div className="w-full space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">

      {/* Reject Design Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ThumbsDown size={18} className="text-red-600" />
                <p className="text-sm font-black text-red-700 uppercase tracking-widest">Request Revision</p>
              </div>
              <button onClick={() => setRejectModal(null)} className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 hover:text-red-600">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {rejectModal.designUrl && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Design Preview</p>
                  <a href={rejectModal.designUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs font-bold underline break-all">{rejectModal.designUrl}</a>
                </div>
              )}
              <div>
                <label className="text-[10px] font-black text-red-600 uppercase tracking-widest block mb-2">Your Feedback (Required)</label>
                <textarea
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  placeholder="Tell the designer what needs to change..."
                  rows={4}
                  className="w-full border-2 border-red-200 rounded-2xl p-4 text-sm font-medium outline-none focus:ring-4 focus:ring-red-500/10 resize-none bg-red-50/30"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={!rejectNotes.trim() || approvalLoading === rejectModal.orderId}
                  className="flex-1 h-11 rounded-2xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-red-700"
                >
                  {approvalLoading === rejectModal.orderId ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
                  Send Revision Request
                </button>
                <button onClick={() => setRejectModal(null)} className="px-5 h-11 rounded-2xl border-2 border-slate-200 text-[10px] font-black text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div className="space-y-2">
          <h1 className="text-5xl font-black font-display tracking-tighter text-slate-900 italic underline decoration-blue-500/20 underline-offset-8">All Orders</h1>
        </div>
        <Link
          href="/dashboard/categories"
          className="inline-flex items-center gap-4 bg-blue-600 text-white px-10 py-5 rounded-3xl font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/30 hover:bg-slate-900 transition-all hover:-translate-y-1 active:translate-y-0"
        >
          <Plus size={18} strokeWidth={3} />
          New Production Order
        </Link>
      </section>

      {/* Stats Cards - Image Centric */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-2">
        {[
         { label: 'Lifetime Orders', value: stats.total,     icon: <ShoppingCart size={16} />, bg: 'bg-blue-600', text: 'text-white' },
         { label: 'Active Process',  value: stats.active,    icon: <Activity size={16} />,     bg: 'bg-white',    text: 'text-blue-600' },
         { label: 'Ready/Shipped',   value: stats.completed, icon: <Package size={16} />,      bg: 'bg-teal-500',  text: 'text-white' },
        ].map((s) => (
         <div key={s.label} className={`${s.bg} rounded-[1.5rem] p-4 shadow-md shadow-slate-200/30 flex flex-col justify-between h-28 md:h-24 border border-slate-100 group hover:scale-[1.005] transition-all`}>
             <div className="flex justify-between items-start">
             <div className={`p-2.5 rounded-2xl ${s.bg === 'bg-white' ? 'bg-slate-50 text-blue-600' : 'bg-white/10 text-white'}`}>
                   {s.icon}
                </div>
             <p className={`text-xl md:text-2xl font-black font-display ${s.text} leading-none`}>{s.value}</p>
             </div>
             <div>
             <p className={`text-[7px] md:text-[8px] font-black uppercase tracking-[0.22em] ${s.bg === 'bg-white' ? 'text-slate-400' : 'text-white/60'}`}>{s.label}</p>
             </div>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="relative group px-2">
        <Search size={20} className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
        <input
          type="text"
          placeholder="Filter by Order ID, Product Type, or Status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border-2 border-slate-50 rounded-[2rem] pl-20 pr-10 py-6 text-base font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-8 focus:ring-blue-500/5 shadow-sm transition-all placeholder:text-slate-300 italic"
        />
      </div>

      {/* Enhanced Image-Rich Orders List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest animate-pulse">Syncing Database...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-2 flex flex-col items-center justify-center py-32 bg-white rounded-[3rem] border border-dashed border-slate-200">
          <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-8">
            <Package size={40} className="text-slate-200" />
          </div>
          <p className="text-slate-400 font-black uppercase tracking-widest text-sm mb-4">
            {search ? 'Negative result for your query' : 'No active production footprints'}
          </p>
          <Link
            href="/dashboard/categories"
            className="text-blue-600 font-black text-xs uppercase tracking-widest border-b-2 border-blue-600 pb-2 hover:text-slate-900 hover:border-slate-900 transition-all"
          >
            Initiate First Protocol
          </Link>
        </div>
      ) : (
        <div className="space-y-8 px-2">
          {filtered.map((order) => {
            const cfg     = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['PLACED'];
            const progress = PROGRESS[order.status] ?? 5;
            const date     = order.createdAt?.seconds
              ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(order.createdAt.seconds * 1000))
              : '—';
            // For child orders (have baseOrderId), show parent's grandTotal; for standalone show own amount
            const baseId = (order as any).baseOrderId;
            const amount = baseId
              ? (parentTotals[baseId] ?? 0)
              : ((order as any).groupGrandTotal ?? order.amounts?.grandTotal ?? (order as any).grandTotal ?? 0);
            const isActive = !['COMPLETED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(order.status);

            return (
              <div
                key={order.id}
                className="group bg-white rounded-[1.25rem] border border-slate-100 shadow-sm shadow-slate-200/20 hover:shadow-md hover:shadow-blue-500/10 transition-all duration-500 overflow-hidden flex flex-col md:flex-row relative"
              >
                {/* Visual Thumbnail Section */}
                 <div className="w-full md:w-20 h-16 md:h-auto flex-shrink-0 p-1 md:p-1.5">
                   <OrderThumbnail orderId={order.id} size="full" className="rounded-xl" />
                </div>

                {/* Content Section */}
                <div className="flex-1 p-1.5 md:p-2 flex flex-col justify-between gap-1">
                  {/* Top Row: ID and Status */}
                  <div className="flex flex-wrap items-start justify-between gap-1">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.15em]">Transaction ID</p>
                      </div>
                      <h3 className="text-sm md:text-base font-black font-display text-slate-900 tracking-tight leading-none">#{order.id.replace('ORD-', '')}</h3>
                      <p className="text-[8px] md:text-[9px] font-bold text-slate-400 mt-0.5 italic leading-none">{date}</p>
                    </div>

                    <div className="text-right">
                       <p className="text-[6px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Workflow State</p>
                       <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xl border-2 text-[6px] font-black uppercase tracking-widest ${cfg.color} shadow-sm transition-all group-hover:scale-105`}>
                          <div className={isActive ? 'animate-pulse' : ''}>{cfg.icon}</div>
                          {cfg.label}
                       </span>
                    </div>
                  </div>

                  {/* Middle Row: Progress and Details */}
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                    <div>
                      <div className="flex justify-between mb-0.5 items-end">
                        <p className="text-[6px] font-black text-slate-400 uppercase tracking-[0.15em]">Production Pipeline</p>
                        <p className="text-[7px] font-black text-blue-600 uppercase tracking-[0.15em] text-right">{cfg.label}</p>
                      </div>
                      <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-1000 relative"
                          style={{ width: `${progress}%` }}
                        >
                           <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-end justify-end gap-1.5 md:gap-2">
                       <div className="text-right">
                          <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Settlement</p>
                          <p className="text-sm md:text-base font-black font-display text-slate-900 tracking-tighter leading-none">₹{amount.toLocaleString()}</p>
                       </div>
                       <div className="space-y-1">
                          <Link 
                            href={`/dashboard/orders/${order.id}`}
                            className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center text-white hover:bg-blue-600 transition-all shadow-md active:scale-90"
                          >
                            <ArrowRight size={12} strokeWidth={3} />
                          </Link>
                       </div>
                    </div>
                  </div>

                  {/* ── Design Approval Action Panel ── */}
                  {(order.status === 'CUSTOMER_APPROVAL_PENDING' || (order as any).workflow?.customerApproval?.status === 'PENDING') && (() => {
                    const proofs = Array.isArray((order as any).workflow?.designerProofs) ? (order as any).workflow.designerProofs : [];
                    const currentVersion = (order as any).workflow?.customerApproval?.currentProofVersion || 0;
                    const currentProof = proofs.find((p: any) => p?.version === currentVersion) || proofs[proofs.length - 1];
                    const designUrl = currentProof?.url || (order as any).workflow?.designUrl;
                    const designNotes = currentProof?.notes || (order as any).workflow?.designNotes;
                    const isLoading = approvalLoading === order.id;
                    return (
                      <div className="mb-1.5 rounded-xl border-2 border-fuchsia-200 bg-fuchsia-50 overflow-hidden">
                        <div className="px-2 py-1 bg-fuchsia-600 flex items-center gap-1.5">
                          <Sparkles size={12} className="text-white animate-pulse" />
                          <p className="text-[6px] font-black text-white uppercase tracking-widest">Design Ready for Your Review</p>
                        </div>
                        <div className="p-2 space-y-1.5">
                          {currentVersion > 0 && (
                            <p className="text-[7px] font-black uppercase tracking-widest text-fuchsia-700">Proof Version: v{currentVersion}</p>
                          )}
                          {designNotes && (
                            <p className="text-[9px] md:text-[10px] text-fuchsia-800 font-medium italic leading-tight">"{designNotes}"</p>
                          )}
                          {designUrl ? (
                            <a
                              href={designUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-fuchsia-700 font-black text-[7px] underline underline-offset-2 hover:text-fuchsia-900 break-all"
                            >
                              <ImageIcon size={10} /> View Design Proof →
                            </a>
                          ) : null}
                          <div className="flex gap-1.5 pt-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleApprove(order.id); }}
                              disabled={isLoading}
                              className="flex-1 h-7 rounded-lg bg-fuchsia-600 text-white text-[7px] font-black uppercase tracking-widest flex items-center justify-center gap-1 disabled:opacity-50 hover:bg-fuchsia-700 shadow-sm transition-all"
                            >
                              {isLoading ? <Loader2 size={10} className="animate-spin" /> : <ThumbsUp size={10} />}
                              Approve Design
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setRejectModal({ orderId: order.id, designUrl }); setRejectNotes(''); }}
                              disabled={isLoading}
                              className="flex-1 h-7 rounded-lg border border-red-200 bg-white text-red-600 text-[7px] font-black uppercase tracking-widest flex items-center justify-center gap-1 disabled:opacity-50 hover:bg-red-50 transition-all"
                            >
                              <ThumbsDown size={10} />
                              Request Revision
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                          <Truck size={10} />
                        </div>
                        <div>
                          <p className="text-[6px] font-black text-slate-400 uppercase tracking-[0.15em] leading-none">Logistic</p>
                          <p className="text-[8px] md:text-[9px] font-black italic text-slate-600 leading-none mt-0.5">
                            {order.status === 'DISPATCHED' || order.status === 'COMPLETED' ? 'DELIVERED' : 'PENDING'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-teal-600 transition-colors">
                          <CreditCard size={10} />
                        </div>
                        <div>
                          <p className="text-[6px] font-black text-slate-400 uppercase tracking-[0.15em] leading-none">Payment</p>
                          <p className="text-[8px] md:text-[9px] font-black italic text-teal-600 leading-none mt-0.5">{order.paymentStatus || 'VERIFIED'}</p>
                        </div>
                      </div>
                    </div>

                    {order.orderType === 'CASH' && order.paymentStatus === 'PENDING' && (
                      <Link 
                        href={`/dashboard/payment/${(order as any).baseOrderId || order.id}`}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-2.5 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest shadow-md shadow-orange-500/20 transition-all hover:scale-[1.05] active:scale-95 flex items-center gap-1"
                      >
                        <IndianRupee size={10} /> Pay Now
                      </Link>
                    )}
                  </div>
                </div>

                {/* Status Indicator Bar */}
                <div className={`absolute top-0 right-0 w-1 h-full ${isActive ? 'bg-blue-500' : 'bg-slate-200'}`} />
              </div>
            );
          })}

          {hasMore && !search && (
            <div className="flex justify-center pt-8">
               <button
                 onClick={() => setLimitCount(prev => prev + 5)}
                 className="bg-white hover:bg-slate-50 text-slate-600 px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] border-2 border-slate-100 hover:border-slate-200 transition-all active:scale-95 flex items-center gap-3 shadow-sm hover:shadow-md"
               >
                 Load Next 5 Orders <ChevronRight size={16} />
               </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


