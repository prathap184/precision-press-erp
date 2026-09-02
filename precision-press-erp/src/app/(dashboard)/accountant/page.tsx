'use client';

/**
 * Customer Approved Payments Dashboard
 *
 * Dedicated, modern financial portal for Accountants:
 * - Real-time feed of orders with verified/accepted customer payments
 * - Key financial metrics (total value, volume, daily approvals)
 * - Quick links to Invoice Generation & Receipts
 * - Payment proof inspection (Google Drive links)
 * - Order & Payment review modals
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
export const dynamic = 'force-dynamic';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  IndianRupee,
  User,
  AlertTriangle,
  X,
  ArrowRight,
  ExternalLink,
  CreditCard,
  Eye,
  Search,
  Calendar,
  Filter,
  Check,
  Package,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';
import { getPaymentsForOrder, PaymentRecord, approvePayment, rejectPayment } from '@/lib/actions/payments';
import { getAllPendingPayments } from '@/lib/actions/payments';
import { RejectionReason } from '@/types/workflow';
import { toast } from 'sonner';
import { format } from 'date-fns';

const safeFormatDate = (v: any) => {
  if (!v) return '—';
  try {
    const d = v?.seconds ? new Date(v.seconds * 1000) : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return format(d, 'dd MMM yyyy, HH:mm');
  } catch {
    return '—';
  }
};

type ActionMode = 'approve' | 'reject' | 'hold' | null;

interface ReviewModalProps {
  order: Order;
  mode: ActionMode;
  onClose: () => void;
  onDone: () => void;
  onRefresh?: () => void;
}

interface PaymentReviewModalProps {
  payment: PaymentRecord;
  onClose: () => void;
  onDone: () => void;
  onRefresh?: () => void;
}

const MODE_LABELS: Record<string, string> = {
  ONLINE_TRANSFER: 'Online Transfer (NEFT/RTGS/IMPS)',
  UPI: 'UPI Payment',
  CASH_DEPOSIT: 'Cash Deposit',
  CHEQUE: 'Cheque Deposit',
};

// ─── Payment Review Modal ─────────────────────────────────────────────────
function PaymentReviewModal({ payment, onClose, onDone, onRefresh }: PaymentReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [mode, setMode] = useState<'view' | 'reject'>('view');

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await approvePayment(payment.id);
      if (res.success) {
        toast.success('✅ Payment approved');
        onRefresh?.();
        setTimeout(() => onDone(), 300);
      } else {
        toast.error(res.error || 'Approval failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setLoading(true);
    try {
      const res = await rejectPayment(payment.id, rejectReason);
      if (res.success) {
        toast.success('✅ Payment rejected');
        onRefresh?.();
        setTimeout(() => onDone(), 300);
      } else {
        toast.error(res.error || 'Rejection failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <CreditCard size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Payment Review</p>
              <p className="text-sm font-bold text-slate-800">{payment.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Amount</p>
              <p className="text-lg font-bold text-slate-800">₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Order ID</p>
              <p className="text-lg font-bold text-slate-800">{payment.orderId}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Payment Mode</p>
              <p className="text-sm font-bold text-slate-800">{MODE_LABELS[payment.paymentMode] || payment.paymentMode}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
              <span
                className={`inline-block text-[10px] font-bold px-2 py-1 rounded ${
                  payment.status === 'APPROVED'
                    ? 'bg-blue-100 text-blue-700'
                    : payment.status === 'REJECTED'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {payment.status}
              </span>
            </div>
          </div>

          {!payment.id.startsWith('V-CREDIT-') && payment.proofDriveLink && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mb-2">Payment Proof</p>
              <a
                href={payment.proofDriveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold"
              >
                <ExternalLink size={14} /> Open in Google Drive
              </a>
            </div>
          )}

          {mode === 'view' ? (
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleApprove}
                disabled={loading || payment.status !== 'PENDING'}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {loading ? 'Approving...' : 'Approve Payment'}
              </button>
              {payment.status === 'PENDING' && (
                <button
                  onClick={() => setMode('reject')}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-3 rounded-lg font-bold flex items-center justify-center gap-2"
                >
                  <XCircle size={14} /> Reject
                </button>
              )}
              <button onClick={onClose} className="px-6 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">
                Close
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-4 border-t">
              <div>
                <label className="text-[9px] font-bold text-slate-600 uppercase tracking-widest block mb-2">Rejection Reason *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g., UTR not matching, cheque bounced..."
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={loading || !rejectReason.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  {loading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
                <button onClick={() => setMode('view')} className="px-6 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Modal ───────────────────────────────────────────────────
function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  useEffect(() => {
    getPaymentsForOrder(order.id)
      .then((res) => setPayments(res || []))
      .catch((err) => console.error('Failed to load payments for order:', err))
      .finally(() => setLoadingPayments(false));
  }, [order.id]);

  const amounts = order.amounts || {};
  const grandTotal = amounts.grandTotal || (order as any).grandTotal || 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Verified Customer Order</span>
            <h3 className="text-base font-bold text-slate-900">#{order.id}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Customer info */}
          <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-800">{order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Customer'}</p>
              <p className="text-[11px] text-slate-500">{order.customerSnapshot?.phone || order.customerSnapshot?.email || 'No phone'}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
              Verified Payment
            </span>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Grand Total</span>
              <span className="text-lg font-black text-slate-900">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Order Type</span>
              <span className="text-sm font-bold text-slate-800 uppercase">{order.orderType || 'CASH'}</span>
            </div>
          </div>

          {/* Line items */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Order Items</h4>
            <div className="space-y-2">
              {(order.items || []).map((item: any, i: number) => (
                <div key={i} className="p-2.5 bg-white border border-slate-100 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{item.productName || item.name || 'Print Item'}</p>
                    <p className="text-[10px] text-slate-400">Qty: {item.quantity || 1} {item.specs?.width ? `• ${item.specs.width}x${item.specs.height} ${item.specs.unit || ''}` : ''}</p>
                  </div>
                  <p className="font-bold text-slate-700">₹{((item.price || item.unitPrice || 0) * (item.quantity || 1)).toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Payment proofs */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Receipts & Proofs</h4>
            {loadingPayments ? (
              <p className="text-xs text-slate-400">Loading payment receipts...</p>
            ) : payments.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No payment documents attached.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-800">₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-slate-500">{MODE_LABELS[p.paymentMode] || p.paymentMode}</p>
                    </div>
                    {p.proofDriveLink && (
                      <a
                        href={p.proofDriveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-bold bg-white px-2 py-1 rounded border border-blue-200"
                      >
                        <ExternalLink size={11} /> View Proof
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <Link
              href={`/accounting/sales/new?orderId=${order.id}`}
              className="flex-1 text-center py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm"
            >
              Generate Invoice
            </Link>
            <Link
              href={`/receipt-entry?orderId=${order.id}`}
              className="flex-1 text-center py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
            >
              Issue Receipt
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────
export default function CustomerApprovedPaymentsPage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState<'ALL' | 'CASH' | 'CREDIT'>('ALL');

  // Real-time listener for orders where payment is accepted / verified
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
        // Filter orders whose payment was accepted/verified or accountant step is completed
        const approved = allOrders.filter((o) => {
          const step = o.workflowSnapshot?.steps?.find((s: any) => s.role === 'ACCOUNTANT');
          const isAccountantCompleted = step?.status === 'COMPLETED';
          const isVerifiedPayment = o.paymentStatus === 'VERIFIED';
          const isAccountsApproved = (o.workflow as any)?.accountsApproved === true;
          return isAccountantCompleted || isVerifiedPayment || isAccountsApproved;
        });
        setOrders(approved);
        setLoading(false);
      },
      (err) => {
        console.error('[Accountant] Approved orders listener error:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Filtered orders
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (activeTypeFilter !== 'ALL' && (o.orderType || 'CASH') !== activeTypeFilter) {
        return false;
      }
      const s = search.toLowerCase();
      if (!s) return true;
      return (
        o.id.toLowerCase().includes(s) ||
        o.customerSnapshot?.displayName?.toLowerCase().includes(s) ||
        o.customerSnapshot?.name?.toLowerCase().includes(s) ||
        o.customerSnapshot?.phone?.toLowerCase().includes(s)
      );
    });
  }, [orders, search, activeTypeFilter]);

  // Financial statistics
  const stats = useMemo(() => {
    const totalApproved = orders.length;
    const totalValue = orders.reduce((sum, o) => {
      const g = o.amounts?.grandTotal || (o as any).grandTotal || 0;
      return sum + Number(g);
    }, 0);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayOrders = orders.filter((o) => {
      const created = o.createdAt
        ? (o.createdAt as any).seconds
          ? (o.createdAt as any).seconds * 1000
          : new Date(o.createdAt as any).getTime()
        : 0;
      return created >= todayStart;
    });

    const todayValue = todayOrders.reduce((sum, o) => sum + Number(o.amounts?.grandTotal || (o as any).grandTotal || 0), 0);

    return {
      totalApproved,
      totalValue,
      todayCount: todayOrders.length,
      todayValue,
    };
  }, [orders]);

  return (
    <RoleGuard allowedRoles={['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/staff">
      <div className="w-full font-sans text-slate-800 relative z-10 min-h-[calc(100vh-4rem)]">
        {/* Clean Light Blue Ambient Background */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#e2ecf8]" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(#bfdbfe_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
          <div className="absolute -top-[15%] -right-[10%] w-[55vw] h-[55vw] rounded-full bg-sky-200/50 blur-[130px]" />
          <div className="absolute -bottom-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-blue-200/40 blur-[130px]" />
          <div className="absolute top-[35%] left-[25%] w-[45vw] h-[45vw] rounded-full bg-sky-100/60 blur-[120px]" />
        </div>

        <div className="w-full relative z-10 p-4 sm:p-6 md:p-8">
          {/* Header Card */}
          <section className="relative z-50 rounded-2xl bg-white/30 px-4 py-2.5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-2xl border border-white/40 mb-4 flex items-center justify-between gap-3 overflow-x-auto scrollbar-hide">
            {/* Title */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-sm">
                <CheckCircle size={16} />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-tight whitespace-nowrap">
                  Customer Approved Payments
                </h1>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Orders whose payments have been accepted & cleared for accounting
                </p>
              </div>
            </div>

            {/* Quick Links */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/accountant/payments"
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white/90 text-slate-700 border border-white/60 transition shadow-2xs flex items-center gap-1.5"
              >
                <CreditCard size={12} className="text-blue-600" />
                Customer Payment Approvals
                <ArrowRight size={11} className="text-slate-400" />
              </Link>
              <Link
                href="/accountant/orders"
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white/90 text-slate-700 border border-white/60 transition shadow-2xs flex items-center gap-1.5"
              >
                <Layers size={12} className="text-indigo-600" />
                (G) Global Orders
                <ArrowRight size={11} className="text-slate-400" />
              </Link>
            </div>

            {/* Metric Pills */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-white/60 shadow-2xs text-xs font-bold text-slate-800">
                <Package size={13} className="text-slate-500" />
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Approved</span>
                <span>{stats.totalApproved}</span>
              </div>
              <div className="bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-white/60 shadow-2xs text-xs font-bold text-emerald-800">
                <IndianRupee size={13} className="text-emerald-600" />
                <span className="text-[10px] text-emerald-600 font-semibold uppercase">Cleared</span>
                <span>₹{stats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-white/60 shadow-2xs text-xs font-bold text-indigo-800">
                <Sparkles size={13} className="text-indigo-600" />
                <span className="text-[10px] text-indigo-600 font-semibold uppercase">Today</span>
                <span>{stats.todayCount}</span>
              </div>
            </div>
          </section>

          {/* Search & Type Filter Bar */}
          <div className="relative z-40 rounded-2xl bg-white/20 px-3.5 py-1.5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-2xl border border-white/30 mb-3 flex gap-2.5 items-center">
            <div className="flex-1 relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search approved payments by Order ID, Customer Name, Phone..."
                className="w-full h-8 bg-white/30 backdrop-blur-md border border-white/40 rounded-lg pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-600 focus:bg-white/50 transition-all shadow-2xs"
              />
            </div>

            {/* Type buttons */}
            <div className="flex items-center gap-1 bg-white/40 backdrop-blur-md p-0.5 rounded-xl border border-white/50 flex-shrink-0">
              {(['ALL', 'CASH', 'CREDIT'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTypeFilter(t)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    activeTypeFilter === t
                      ? 'bg-white/90 text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  {t === 'ALL' ? 'All Orders' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Orders Table */}
          <div className="relative z-30 rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/70 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-black/15">
                    <th className="py-3 px-3 text-slate-800 text-[13px] font-semibold text-left w-[160px]">Order & Date</th>
                    <th className="py-3 px-3 text-slate-800 text-[13px] font-semibold text-left w-[260px]">Customer</th>
                    <th className="py-3 px-3 text-slate-800 text-[13px] font-semibold text-left">Items & Specs</th>
                    <th className="py-3 px-4 text-slate-800 text-[13px] font-semibold text-right w-[140px]">Settlement</th>
                    <th className="py-3 px-3 text-slate-800 text-[13px] font-semibold text-center w-[200px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-0">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                          <p className="text-[13px] font-normal text-slate-500">Loading approved payments...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <p className="text-[13px] font-normal text-slate-400 italic">No approved payments found.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((order, idx) => {
                      const grandTotal = order.amounts?.grandTotal || (order as any).grandTotal || 0;
                      const itemsCount = (order.items || []).length;
                      const firstItem = order.items?.[0] as any;
                      const itemName = firstItem?.productName || firstItem?.name || 'Custom Print';

                      return (
                        <tr
                          key={order.id}
                          className={`transition-colors hover:bg-emerald-50/30 ${
                            idx % 2 === 0 ? 'bg-white/40' : 'bg-white/10'
                          }`}
                        >
                          {/* Order & Date */}
                          <td className="px-3 py-3 align-top border-b border-slate-100">
                            <div className="flex items-start gap-2.5">
                              <OrderThumbnail order={order} size="sm" />
                              <div className="min-w-0">
                                <p className="font-mono font-bold text-xs text-slate-900 truncate">
                                  #{order.id.replace('ORD-', '')}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{safeFormatDate(order.createdAt)}</p>
                                <span className="inline-block mt-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {order.orderType || 'CASH'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Customer */}
                          <td className="px-3 py-3 align-top border-b border-slate-100">
                            <div className="flex items-start gap-2">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                                {(order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'C')[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 text-xs truncate">
                                  {order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Direct Client'}
                                </p>
                                <p className="text-slate-400 text-[11px] truncate">
                                  {order.customerSnapshot?.phone || order.customerSnapshot?.email || 'No contact'}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Items & Specs */}
                          <td className="px-3 py-3 align-top border-b border-slate-100">
                            <p className="font-medium text-slate-800 text-xs truncate max-w-xs">{itemName}</p>
                            <p className="text-[10px] text-slate-400">
                              {itemsCount > 1 ? `+ ${itemsCount - 1} other item(s)` : 'Single item'}
                              {firstItem?.specs?.width && ` • ${firstItem.specs.width}x${firstItem.specs.height} ${firstItem.specs.unit || ''}`}
                            </p>
                          </td>

                          {/* Settlement */}
                          <td className="px-4 py-3 align-top text-right tabular-nums border-b border-slate-100">
                            <p className="text-slate-900 text-sm font-bold">₹{Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded mt-0.5">
                              <Check size={10} /> Verified
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-3 align-top text-center border-b border-slate-100">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="text-[11px] font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg py-1 px-2.5 transition shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                                title="View Details & Proof"
                              >
                                <Eye size={12} className="text-slate-500" />
                                Details
                              </button>
                              <Link
                                href={`/accounting/sales/new?orderId=${order.id}`}
                                className="text-[11px] font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/50 rounded-lg py-1 px-2.5 transition shadow-2xs inline-flex items-center gap-1"
                              >
                                Invoice
                              </Link>
                              <Link
                                href={`/receipt-entry?orderId=${order.id}`}
                                className="text-[11px] font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 rounded-lg py-1 px-2.5 transition shadow-2xs inline-flex items-center gap-1"
                              >
                                Receipt
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Order Details Modal */}
        {selectedOrder && (
          <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        )}
      </div>
    </RoleGuard>
  );
}
