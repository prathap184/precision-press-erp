'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
export const dynamic = 'force-dynamic';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import {
  ShieldCheck,
  Inbox,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  ChevronRight,
  FileText,
  IndianRupee,
  User,
  AlertTriangle,
  X,
  ArrowRight,
  LayoutGrid,
  ExternalLink,
  CreditCard,
  Eye,
} from 'lucide-react';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { StaffRole } from '@/types/roles';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import { advanceOrderWorkflow, holdOrderWorkflow, rejectOrderWorkflow } from '@/lib/workflow';
import { getPaymentsForOrder, PaymentRecord, approvePayment, rejectPayment } from '@/lib/actions/payments';
import { getAllPendingPayments } from '@/lib/actions/payments';
import { usePaymentApprovals } from '@/lib/use-payment-approvals';
import { WorkflowTaskQueue } from '@/components/production/WorkflowTaskQueue';
import { RoleUnassignedBacklog } from '@/components/dashboard/RoleUnassignedBacklog';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';
import { RejectionReason } from '@/types/workflow';
import { toast } from 'sonner';
import { format } from 'date-fns';

const safeFormatDate = (v: any) => {
  if (!v) return '—';
  try {
    const d = v?.seconds ? new Date(v.seconds * 1000) : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return format(d, 'MMM dd, HH:mm');
  } catch { return '—'; }
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

  const OUR_BANKS: Record<string, string> = {
    ICICI_001: 'ICICI Bank — A/C ···5678',
    SBI_001:   'SBI — A/C ···4567',
    HDFC_001:  'HDFC Bank — A/C ···8901',
    KOTAK_001: 'Kotak Mahindra — A/C ···2345',
  };

  const MODE_LABELS: Record<string, string> = {
    ONLINE_TRANSFER: 'Online Transfer (NEFT/RTGS/IMPS)',
    UPI:             'UPI Payment',
    CASH_DEPOSIT:    'Cash Deposit',
    CHEQUE:          'Cheque Deposit',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
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
          {/* Payment Details */}
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
              <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded ${
                payment.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                payment.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>{payment.status}</span>
            </div>
          </div>

          {/* Proof Link */}
          {!payment.id.startsWith('V-CREDIT-') && payment.proofDriveLink && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest mb-2">Payment Proof</p>
              <a href={payment.proofDriveLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold">
                <ExternalLink size={14} />
                Open in Google Drive
              </a>
            </div>
          )}

          {/* Rejection form or approve button */}
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
                  <XCircle size={14} />
                  Reject
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
                  onChange={e => setRejectReason(e.target.value)}
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

function ReviewModal({ order, mode, onClose, onDone, onRefresh }: ReviewModalProps) {
  const [notes, setNotes] = useState('');
  const [reasonCode, setReasonCode] = useState<RejectionReason | ''>('');
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  useEffect(() => {
    if (order.orderType === 'CASH') {
      getPaymentsForOrder(order.id).then(res => {
        setPayments(res);
        setLoadingPayments(false);
      });
    } else {
      setLoadingPayments(false);
    }
  }, [order.id, order.orderType]);

  const handleSubmit = async () => {
    if ((mode === 'reject' || mode === 'hold') && !reasonCode) {
      toast.error('A reason code is required for audit compliance.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'approve') {
        // First approve all pending payments for this order
        const pendingPayments = payments.filter(p => p.status === 'PENDING');
        for (const payment of pendingPayments) {
          await approvePayment(payment.id);
        }
        
        // Then advance the order workflow
        const res = await advanceOrderWorkflow(order.id, notes);
        if (res && res.success) {
          toast.success(`Order ${order.id} approved and moved to next stage.`);
          onRefresh?.();
          setTimeout(() => onDone(), 300);
        } else if (res && !res.success) {
          toast.error('Failed to advance order.');
        } else {
          toast.success(`Order ${order.id} approved and moved to next stage.`);
          onRefresh?.();
          setTimeout(() => onDone(), 300);
        }
      } else if (mode === 'hold') {
        const res = await holdOrderWorkflow(order.id, reasonCode as RejectionReason, notes);
        if (res.success) {
          toast.success(`Order ${order.id} placed ON HOLD.`);
          onRefresh?.();
          setTimeout(() => onDone(), 300);
        }
      } else {
        const res = await rejectOrderWorkflow(order.id, reasonCode as RejectionReason, notes);
        if (res.success) {
          toast.success(`Order ${order.id} rejected.`);
          onRefresh?.();
          setTimeout(() => onDone(), 300);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    } finally {
      setLoading(false);
    }
  };

  const isApprove = mode === 'approve';
  const isHold = mode === 'hold';
  const isReject = mode === 'reject';

  const modalBg = isApprove ? 'bg-emerald-50 border-emerald-200' : isHold ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200';
  const textCol = isApprove ? 'text-emerald-600' : isHold ? 'text-orange-600' : 'text-red-600';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-5 py-3 border-b flex items-center justify-between ${modalBg}`}>
          <div className="flex items-center gap-2">
            {isApprove && <CheckCircle className="text-emerald-600" size={16} />}
            {isHold && <AlertTriangle className="text-orange-600" size={16} />}
            {isReject && <XCircle className="text-red-600" size={16} />}
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${textCol}`}>
                {isApprove ? 'Approve Order' : isHold ? 'Hold Order' : 'Reject Order'}
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

          {/* Payment Proofs */}
          {order.orderType === 'CASH' && (
            <div className="bg-slate-50 border border-slate-200 rounded p-3">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Payment Proofs & Approvals</p>
              {loadingPayments ? (
                <p className="text-xs text-slate-500 font-medium">Loading payments...</p>
              ) : payments.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-white border border-slate-100 rounded p-2 text-xs hover:border-blue-200 transition-colors">
                      <div className="flex flex-col flex-1">
                        <span className="font-bold text-slate-800">₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        <span className="text-[10px] text-slate-500 font-medium uppercase">{p.paymentMode}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded whitespace-nowrap ${p.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' : p.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.status}</span>
                          {p.proofDriveLink && (
                            <a href={p.proofDriveLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 transition-colors text-[9px]">
                              <ExternalLink size={10} /> View
                            </a>
                          )}
                        </div>
                        {mode === 'approve' && p.status === 'PENDING' && !loading && (
                          <button
                            onClick={() => approvePayment(p.id).catch(e => toast.error('Payment approval failed: ' + e.message))}
                            className="w-7 h-7 rounded bg-emerald-100 hover:bg-emerald-600 text-emerald-600 hover:text-white flex items-center justify-center transition-all text-[10px] font-bold"
                            title="Approve this payment"
                          >
                            <CheckCircle size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic font-medium">No payments submitted yet.</p>
              )}
            </div>
          )}

          {/* Notes / Reason */}
          <div className="space-y-3">
            {!isApprove && (
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-widest block mb-1.5 ${textCol}`}>
                  Reason Code *
                </label>
                <select
                  value={reasonCode}
                  onChange={e => setReasonCode(e.target.value as RejectionReason)}
                  className={`w-full border rounded p-3 text-xs font-medium outline-none focus:ring-2 ${isHold ? 'border-orange-200 focus:ring-orange-500/20 bg-orange-50/30' : 'border-red-200 focus:ring-red-500/20 bg-red-50/30'}`}
                >
                  <option value="" disabled>Select Reason...</option>
                  <option value="INVALID_ARTWORK">INVALID_ARTWORK - Artwork is missing or corrupt</option>
                  <option value="PAYMENT_ISSUE">PAYMENT_ISSUE - Payment incomplete or missing</option>
                  <option value="SIZE_MISMATCH">SIZE_MISMATCH - Requested dimensions are not possible</option>
                  <option value="MISSING_DETAILS">MISSING_DETAILS - Missing crucial order specifics</option>
                  <option value="FRAUD_SUSPICION">FRAUD_SUSPICION - Suspicious activity detected</option>
                  <option value="OTHER">OTHER - Custom reason</option>
                </select>
              </div>
            )}
            <div>
              <label className={`text-[10px] font-bold uppercase tracking-widest block mb-1.5 ${isApprove ? 'text-slate-600' : textCol}`}>
                {isApprove ? 'Approval Notes (Optional)' : 'Additional Notes (Required for OTHER)'}
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={isApprove ? 'e.g. Verified customer identity, pricing confirmed...' : 'e.g. Please clarify the precise cutting dimensions...'}
                rows={3}
                className={`w-full border rounded p-3 text-xs font-medium outline-none focus:ring-2 resize-none ${isApprove ? 'border-slate-200 focus:ring-emerald-500/20' : isHold ? 'border-orange-200 focus:ring-orange-500/20 bg-orange-50/30' : 'border-red-200 focus:ring-red-500/20 bg-red-50/30'}`}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={`flex-1 h-9 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 ${isApprove ? 'bg-emerald-600 text-white hover:bg-emerald-700' : isHold ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : (isApprove ? <CheckCircle size={12} /> : isHold ? <AlertTriangle size={12} /> : <XCircle size={12} />)}
              {loading ? 'Processing...' : (isApprove ? 'Confirm Approval' : isHold ? 'Place On Hold' : 'Confirm Rejection')}
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

export default function AccountantDashboard() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const highlightOrderId = searchParams.get('orderId');
  const [placedOrders, setPlacedOrders] = useState<Order[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'payments'>('orders');

  // Load orders
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['PLACED', 'ON_HOLD']),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setPlacedOrders(docs);
      setLoading(false);
    }, (err) => {
      console.error('[Accountant] Placed orders listener failed:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Load pending payments
  useEffect(() => {
    const loadPayments = async () => {
      try {
        const payments = await getAllPendingPayments();
        setPendingPayments(payments || []);
      } catch (err) {
        console.error('[Accountant] Failed to load pending payments:', err);
      }
    };

    loadPayments();
    const interval = setInterval(loadPayments, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const hasAutoOpened = React.useRef(false);

  useEffect(() => {
    if (highlightOrderId && placedOrders.length > 0 && !hasAutoOpened.current) {
      const orderToHighlight = placedOrders.find(o => o.id === highlightOrderId);
      if (orderToHighlight) {
        setSelectedOrder(orderToHighlight);
        setActionMode('approve');
        setActiveTab('orders');
        hasAutoOpened.current = true;
      }
    }
  }, [highlightOrderId, placedOrders]);

  // Refresh pending payments immediately
  const refreshPendingPayments = async () => {
    try {
      const payments = await getAllPendingPayments();
      setPendingPayments(payments || []);
    } catch (err) {
      console.error('[Accountant] Failed to refresh pending payments:', err);
    }
  };

  // Refresh placed orders
  const refreshPlacedOrders = async () => {
    try {
      const q = query(
        collection(db, 'orders'),
        where('status', 'in', ['PLACED', 'ON_HOLD']),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await new Promise((resolve, reject) => {
        const unsub = onSnapshot(q, resolve, reject);
        return unsub;
      });
      const docs = (snap as any).docs.map((d: any) => ({ id: d.id, ...d.data() } as Order));
      setPlacedOrders(docs);
    } catch (err) {
      console.error('[Accountant] Failed to refresh placed orders:', err);
    }
  };

  const openOrderAction = (order: Order, mode: ActionMode) => {
    setSelectedOrder(order);
    setActionMode(mode);
    setSelectedPayment(null);
  };

  const openPaymentModal = (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    setSelectedOrder(null);
    setActionMode(null);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setSelectedPayment(null);
    setActionMode(null);
  };

  return (
    <RoleGuard allowedRoles={['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Approved Payments</h2>
            <p className="text-[10px] text-slate-500 font-medium">Orders whose payments were already accepted by this accountant.</p>
          </div>

          <RoleActiveJobs role="ACCOUNTANT" userId={profile?.uid || undefined} maxHeight="none" activeScope="all" />
        </section>
      </div>
    </RoleGuard>
  );
}


