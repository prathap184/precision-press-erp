'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getAllPendingPayments,
  getAllPaymentsAdmin,
  approvePayment,
  rejectPayment,
  getGroupOrderSummary,
  getOrderSummary,
  PaymentRecord,
} from '@/lib/actions/payments';
import { usePaymentApprovals } from '@/lib/use-payment-approvals';
import { RoleGuard } from '@/lib/role-guard';
import toast from 'react-hot-toast';
import {
  CheckCircle, XCircle, Clock, Loader2, Search,
  Eye, RefreshCw, IndianRupee, ShieldCheck,
  AlertTriangle, ExternalLink, X, Calendar,
  Building2, CreditCard, FileText, User, Check, Layers
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, limit as firestoreLimit } from '@/lib/supabase-firestore-shim';
import { GlobalStats } from '@/types/stats';

// ─── Display maps ──────────────────────────────────────────────────────────────
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

// ─── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDate = (iso: string) =>
  iso ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—';
const fmtTs  = (v: any) => {
  if (!v) return '—';
  const d = v.seconds ? new Date(v.seconds * 1000) : new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    PENDING:  { cls: 'bg-yellow-50 text-yellow-700 border-yellow-300', icon: <Clock size={11} />,        label: 'Pending Review' },
    APPROVED: { cls: 'bg-blue-50  text-blue-700  border-blue-300',  icon: <CheckCircle size={11} />, label: 'Approved' },
    REJECTED: { cls: 'bg-red-50    text-red-600    border-red-300',    icon: <XCircle size={11} />,      label: 'Rejected' },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

// ─── Payment Detail Modal ──────────────────────────────────────────────────────
function PaymentModal({
  payment,
  onClose,
  onApprove,
  onReject,
  actioning,
}: {
  payment: PaymentRecord;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  actioning: boolean;
}) {
  const [mode, setMode]       = useState<'view' | 'reject'>('view');
  const [reason, setReason]   = useState('');
  const isPending             = payment.status === 'PENDING';

  const [orderSummary, setOrderSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    if (payment.id.startsWith('V-CREDIT-')) return;
    const fetchSummary = async () => {
      try {
        const isChildItem = Boolean(payment.orderId && payment.orderId.includes('-item'));
        const targetId = isChildItem ? payment.orderId : (payment.orderId || payment.baseOrderId);
        const baseId = payment.orderId ? payment.orderId.split('-item')[0] : (payment.baseOrderId || '');
        
        let res: any = null;

        // 1. If child item, query the child order first
        if (isChildItem && targetId) {
          try {
            const snap = await getDoc(doc(db, 'orders', targetId));
            if (snap.exists()) {
              const ord = snap.data() as any;
              let itemObj: any = null;
              if (ord.items) {
                const parsed = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items;
                itemObj = Array.isArray(parsed) ? parsed[0] : parsed;
              }
              if (!itemObj && baseId) {
                const matchIdx = targetId.match(/-item(\d+)/);
                if (matchIdx) {
                  const idx = parseInt(matchIdx[1], 10) - 1;
                  const parentSnap = await getDoc(doc(db, 'orders', baseId));
                  if (parentSnap.exists()) {
                    const pData = parentSnap.data() as any;
                    const pItems = typeof pData.items === 'string' ? JSON.parse(pData.items) : pData.items;
                    if (Array.isArray(pItems) && pItems[idx]) itemObj = pItems[idx];
                  }
                }
              }

              const itemAmt = ord.item_amount ?? ord.amounts?.productTotal ?? ord.amounts?.subTotal ?? itemObj?.pricingSnapshot?.subTotal ?? itemObj?.subTotal ?? itemObj?.amount ?? 0;
              const finishAmt = ord.amounts?.eyeletsTotal ?? 0;
              const logAmt = ord.allocated_logistics_amount ?? ord.amounts?.deliveryCharges ?? ord.amounts?.transport ?? 0;
              const cgstAmt = ord.cgst_amount ?? ord.amounts?.cgst ?? 0;
              const sgstAmt = ord.sgst_amount ?? ord.amounts?.sgst ?? 0;
              const igstAmt = ord.igst_amount ?? ord.amounts?.igst ?? 0;
              const grandTotalAmt = ord.grand_total_snapshot ?? ord.amounts?.grandTotal ?? (itemAmt + finishAmt + logAmt + cgstAmt + sgstAmt + igstAmt);

              res = {
                grandTotal: grandTotalAmt,
                amounts: ord.amounts || {},
                items: [{
                  orderId: targetId,
                  productName: ord.productName || itemObj?.productName || itemObj?.name || 'Order Item',
                  quantity: itemObj?.specs?.quantity || itemObj?.quantity || 1,
                  amount: itemAmt,
                }],
                baseValue: itemAmt,
                finishValue: finishAmt,
                logistics: logAmt,
                igst: igstAmt,
                cgst: cgstAmt,
                sgst: sgstAmt,
              };
            }
          } catch (e) {}

          // Fallback Supabase for child item
          if (!res) {
            const { data: ord } = await supabase
              .from('orders')
              .select('*')
              .eq('id', targetId)
              .single();

            if (ord) {
              let itemObj: any = null;
              if (ord.items) {
                const parsed = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items;
                itemObj = Array.isArray(parsed) ? parsed[0] : parsed;
              }
              const itemAmt = ord.item_amount ?? ord.amounts?.productTotal ?? ord.amounts?.subTotal ?? itemObj?.pricingSnapshot?.subTotal ?? itemObj?.subTotal ?? itemObj?.amount ?? 0;
              const finishAmt = ord.amounts?.eyeletsTotal ?? 0;
              const logAmt = ord.allocated_logistics_amount ?? ord.amounts?.deliveryCharges ?? ord.amounts?.transport ?? 0;
              const cgstAmt = ord.cgst_amount ?? ord.amounts?.cgst ?? 0;
              const sgstAmt = ord.sgst_amount ?? ord.amounts?.sgst ?? 0;
              const igstAmt = ord.igst_amount ?? ord.amounts?.igst ?? 0;
              const grandTotalAmt = ord.grand_total_snapshot ?? ord.amounts?.grandTotal ?? (itemAmt + finishAmt + logAmt + cgstAmt + sgstAmt + igstAmt);

              res = {
                grandTotal: grandTotalAmt,
                amounts: ord.amounts || {},
                items: [{
                  orderId: targetId,
                  productName: ord.productName || itemObj?.productName || itemObj?.name || 'Order Item',
                  quantity: itemObj?.specs?.quantity || itemObj?.quantity || 1,
                  amount: itemAmt,
                }],
                baseValue: itemAmt,
                finishValue: finishAmt,
                logistics: logAmt,
                igst: igstAmt,
                cgst: cgstAmt,
                sgst: sgstAmt,
              };
            }
          }
        }

        // 2. Parent / Base Order Lookup (non-child order)
        if (!res && targetId) {
          try {
            const snap = await getDoc(doc(db, 'orders', targetId));
            if (snap.exists()) {
              const ord = snap.data() as any;
              let parsedItems: any[] = [];
              if (ord.items) {
                parsedItems = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items;
              }
              res = {
                grandTotal: ord.amounts?.grandTotal || ord.totalAmount || payment.amount,
                amounts: ord.amounts || {},
                items: parsedItems,
                baseValue: ord.amounts?.productTotal ?? ord.amounts?.subTotal ?? 0,
                finishValue: ord.amounts?.eyeletsTotal ?? 0,
                logistics: ord.amounts?.deliveryCharges ?? ord.amounts?.transport ?? 0,
                igst: ord.amounts?.igst ?? 0,
                cgst: ord.amounts?.cgst ?? 0,
                sgst: ord.amounts?.sgst ?? 0,
              };
            }
          } catch (e) {}
        }

        // 3. Server actions
        if (!res && payment.baseOrderId && !isChildItem) {
          res = await getGroupOrderSummary(payment.baseOrderId);
        }
        if (!res && targetId) {
          res = await getOrderSummary(targetId);
        }

        // 4. Supabase fallback
        if (!res && targetId) {
          const { data: ord } = await supabase
            .from('orders')
            .select('*')
            .or(`id.eq.${targetId},id.eq.${baseId}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (ord) {
            let parsedItems: any[] = [];
            if (ord.items) {
              parsedItems = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items;
            }
            res = {
              grandTotal: ord.amounts?.grandTotal || ord.totalAmount || payment.amount,
              amounts: ord.amounts || {},
              items: parsedItems,
              baseValue: ord.amounts?.productTotal ?? ord.amounts?.subTotal ?? 0,
              finishValue: ord.amounts?.eyeletsTotal ?? 0,
              logistics: ord.amounts?.deliveryCharges ?? ord.amounts?.transport ?? 0,
              igst: ord.amounts?.igst ?? 0,
              cgst: ord.amounts?.cgst ?? 0,
              sgst: ord.amounts?.sgst ?? 0,
            };
          }
        }

        if (res) {
          setOrderSummary(res);
        }
      } catch (e) {
        console.error('Failed to load order summary:', e);
      } finally {
        setLoadingSummary(false);
      }
    };
    fetchSummary();
  }, [payment]);

  // Construct displaySummary exactly as in PaymentPage
  const displaySummary = (() => {
    if (orderSummary) {
      // Map items from orderSummary if payment.itemBreakdown is missing or empty
      const fetchedItems = orderSummary.items ? orderSummary.items.map((it: any) => ({
        orderId: payment.orderId || payment.baseOrderId || '',
        productName: it.productName || it.name || 'Order Item',
        quantity: it.specs?.quantity || it.quantity || 1,
        amount: it.pricingSnapshot?.subTotal || it.subTotal || it.amount || 0,
      })) : [];

      const items = (payment.itemBreakdown && payment.itemBreakdown.length > 0) 
        ? payment.itemBreakdown 
        : fetchedItems;

      return {
        items: items.length > 0 ? items : [{
          orderId: payment.orderId || payment.baseOrderId || '',
          productName: 'Order Items',
          quantity: 1,
          amount: orderSummary.amounts?.productTotal || orderSummary.amounts?.subTotal || orderSummary.grandTotal || payment.amount
        }],
        baseValue: orderSummary.baseValue ?? orderSummary.amounts?.productTotal ?? orderSummary.amounts?.subTotal ?? 0,
        finishValue: orderSummary.finishValue ?? orderSummary.amounts?.eyeletsTotal ?? 0,
        logistics: orderSummary.logistics ?? orderSummary.amounts?.deliveryCharges ?? orderSummary.amounts?.transport ?? 0,
        igst: orderSummary.igst ?? orderSummary.amounts?.igst ?? 0,
        cgst: orderSummary.cgst ?? orderSummary.amounts?.cgst ?? 0,
        sgst: orderSummary.sgst ?? orderSummary.amounts?.sgst ?? 0,
        grandTotal: orderSummary.grandTotal || orderSummary.amounts?.grandTotal || payment.amount
      };
    }
    // Fallback if not loaded
    return {
      items: payment.itemBreakdown && payment.itemBreakdown.length > 0 ? payment.itemBreakdown : [{
        orderId: payment.orderId || payment.baseOrderId || '',
        productName: 'Order Items',
        quantity: 1,
        amount: payment.amount
      }],
      baseValue: payment.amount, finishValue: 0, logistics: 0, gst: 0, igst: 0, cgst: 0, sgst: 0,
      grandTotal: payment.amount
    };
  })();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 uppercase tracking-tighter">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <CreditCard size={20} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Payment Review</p>
              <h2 className="text-xl font-black text-slate-900">{payment.id}</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all hover:rotate-90">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-8 space-y-6">

          {/* Status banner */}
          <div className="flex items-center justify-between">
            <StatusBadge status={payment.status} />
            <p className="text-[10px] font-bold text-slate-400">Submitted: {fmtTs(payment.createdAt)}</p>
          </div>

          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-4">
            {payment.id.startsWith('V-CREDIT-') ? (
              // CREDIT SPECIFIC VIEW
              <>
                {[
                  { icon: <FileText size={14} />, label: 'Order ID',       value: payment.orderId },
                  { icon: <IndianRupee size={14} />, label: 'Amount to Debit', value: fmt(payment.amount) },
                  { icon: <ShieldCheck size={14} />, label: 'Auth Method', value: 'Credit Account' },
                  { icon: <User size={14} />,   label: 'Customer', value: payment.customerName || 'Standard' },
                ].map(item => (
                  <div key={item.label} className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-500">{item.icon}</span>
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">{item.label}</p>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{item.value}</p>
                  </div>
                ))}
                
                {/* Credit Balance Detail */}
                {(() => {
                  if (!payment.depositRefNo?.startsWith('BAL:')) return null;
                  const parts = payment.depositRefNo.replace('BAL:', '').split('|');
                  if (parts.length < 3) return null;
                  
                  const usedBefore = parseFloat(parts[0]);
                  const limit      = parseFloat(parts[1]);
                  const usedAfter  = parseFloat(parts[2]);
                  const remaining  = limit - usedAfter;

                  return (
                    <div className="col-span-2 bg-indigo-50 rounded-[2.5rem] p-8 border border-indigo-100 shadow-inner relative overflow-hidden">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2 text-indigo-600">
                          <ShieldCheck size={18} />
                          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Credit Utilization Audit</p>
                        </div>
                        <a 
                          href={`/accountant/ledger?search=${encodeURIComponent(payment.customerName || '')}`}
                          className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-[10px] font-black text-indigo-600 border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >
                          <User size={12} />
                          View Full Ledger
                        </a>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white/60 backdrop-blur-sm p-4 rounded-2xl border border-white/50 text-center">
                          <p className="text-[9px] font-bold text-indigo-400 uppercase mb-1">Used (Before)</p>
                          <p className="text-sm font-black text-indigo-300">₹{usedBefore.toLocaleString()}</p>
                        </div>
                        <div className="bg-indigo-600 p-4 rounded-2xl text-center text-white shadow-lg shadow-indigo-200 flex flex-col justify-center">
                          <p className="text-[9px] font-bold text-indigo-200 uppercase mb-1">Current Order</p>
                          <p className="text-base font-black">₹{payment.amount.toLocaleString()}</p>
                        </div>
                        <div className="bg-white/60 backdrop-blur-sm p-4 rounded-2xl border border-white/50 text-center">
                          <p className="text-[9px] font-bold text-indigo-500 uppercase mb-1">Used (After)</p>
                          <p className="text-sm font-black text-indigo-700">₹{usedAfter.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 p-5 rounded-2xl text-white flex justify-between items-center shadow-lg shadow-indigo-100">
                        <div>
                          <p className="text-[9px] font-bold text-indigo-100 uppercase tracking-widest mb-0.5">Remaining Credit Limit</p>
                          <p className="text-xl font-black">₹{remaining.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-bold text-indigo-200 uppercase mb-0.5">Limit Authorized</p>
                          <p className="text-xs font-black">₹{limit.toLocaleString()}</p>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex items-center justify-center gap-2">
                         <div className="h-1 flex-1 bg-indigo-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-600" 
                              style={{ width: `${Math.min((usedAfter / limit) * 100, 100)}%` }}
                            />
                         </div>
                         <span className="text-[10px] font-black text-indigo-600">{Math.round((usedAfter / limit) * 100)}%</span>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              // STANDARD PAYMENT VIEW
              <>
                {/* Payment Item Breakdown */}
                {Array.isArray(displaySummary.items) && displaySummary.items.length > 0 && (
                  <div className="col-span-2 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-400"><Layers size={14} /></span>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Order Summary Breakdown</p>
                    </div>
                    <div className="bg-slate-900 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="px-4 py-2.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">#</th>
                            <th className="px-4 py-2.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                            <th className="px-4 py-2.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">Item</th>
                            <th className="px-4 py-2.5 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {displaySummary.items.map((item: any, idx: number) => (
                            <tr key={item.orderId || idx} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-2.5 text-[10px] font-black text-slate-500">{idx + 1}</td>
                              <td className="px-4 py-2.5 text-[10px] font-black text-blue-400 font-mono">{item.orderId || '-'}</td>
                              <td className="px-4 py-2.5 text-[10px] font-medium text-white/70">
                                {item.productName || item.name || 'Item'}
                                {item.quantity > 1 && <span className="text-white/40 ml-1">× {item.quantity}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-[10px] font-black text-white text-right tabular-nums">{fmt(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tbody className="divide-y divide-white/5 bg-slate-800/50">
                          {loadingSummary ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-4 text-center text-[10px] text-slate-500 font-medium animate-pulse">
                                Loading financial breakdown...
                              </td>
                            </tr>
                          ) : (
                            <>
                              <tr>
                                <td colSpan={3} className="px-4 py-2 text-[9px] font-medium text-slate-400">Base Value</td>
                                <td className="px-4 py-2 text-[10px] font-medium text-white text-right tabular-nums">{fmt(displaySummary.baseValue)}</td>
                              </tr>
                              <tr>
                                <td colSpan={3} className="px-4 py-2 text-[9px] font-medium text-slate-400">Finish (Eyelets)</td>
                                <td className="px-4 py-2 text-[10px] font-medium text-white text-right tabular-nums">{fmt(displaySummary.finishValue)}</td>
                              </tr>
                              <tr>
                                <td colSpan={3} className="px-4 py-2 text-[9px] font-medium text-slate-400">Logistics</td>
                                <td className="px-4 py-2 text-[10px] font-medium text-white text-right tabular-nums">{fmt(displaySummary.logistics)}</td>
                              </tr>
                              {displaySummary.igst > 0 ? (
                                <tr>
                                  <td colSpan={3} className="px-4 py-2 text-[9px] font-medium text-slate-400">IGST</td>
                                  <td className="px-4 py-2 text-[10px] font-medium text-white text-right tabular-nums">{fmt(displaySummary.igst)}</td>
                                </tr>
                              ) : (
                                <>
                                  <tr>
                                    <td colSpan={3} className="px-4 py-2 text-[9px] font-medium text-slate-400">CGST</td>
                                    <td className="px-4 py-2 text-[10px] font-medium text-white text-right tabular-nums">{fmt(displaySummary.cgst)}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={3} className="px-4 py-2 text-[9px] font-medium text-slate-400">SGST</td>
                                    <td className="px-4 py-2 text-[10px] font-medium text-white text-right tabular-nums">{fmt(displaySummary.sgst)}</td>
                                  </tr>
                                </>
                              )}
                            </>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-white/10 bg-blue-600">
                            <td colSpan={3} className="px-4 py-3 text-[9px] font-black text-blue-100 uppercase tracking-widest">Grand Total</td>
                            <td className="px-4 py-3 text-[13px] font-black text-white text-right tabular-nums">{fmt(displaySummary.grandTotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {[
                  { icon: <FileText size={14} />, label: Array.isArray(payment.itemBreakdown) && payment.itemBreakdown.length > 1 ? 'Group Order ID' : 'Order ID', value: payment.baseOrderId || payment.orderId },
                  { icon: <IndianRupee size={14} />, label: 'Total Amount', value: fmt(payment.amount) },
                  { icon: <CreditCard size={14} />, label: 'Payment Mode', value: MODE_LABELS[payment.paymentMode] ?? payment.paymentMode },
                  { icon: <Calendar size={14} />,   label: 'Deposit Date', value: fmtDate(payment.depositDate) },
                  { icon: <Building2 size={14} />,  label: 'Deposit Bank', value: `${payment.depositBank}${payment.branchName ? ` · ${payment.branchName}` : ''}` },
                  { icon: <Building2 size={14} />,  label: 'Our Account',  value: OUR_BANKS[payment.ourBankAccount] ?? payment.ourBankAccount },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-400">{item.icon}</span>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{item.value}</p>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Standard Ref No (for physical payments) */}
          {!payment.id.startsWith('V-CREDIT-') && payment.depositRefNo && (
            <div className="bg-indigo-50 rounded-2xl p-4 flex items-center gap-3">
              <FileText size={16} className="text-indigo-500" />
              <div>
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Reference / UTR / Cheque No</p>
                <p className="text-sm font-black text-indigo-700">{payment.depositRefNo}</p>
              </div>
            </div>
          )}

          {/* Remarks */}
          {payment.remarks && (
            <div className={`rounded-2xl p-4 flex items-start gap-3 border ${payment.id.startsWith('V-CREDIT-') ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              {payment.id.startsWith('V-CREDIT-') ? <ShieldCheck size={16} className="text-blue-500 mt-0.5" /> : <AlertTriangle size={16} className="text-amber-500 mt-0.5" />}
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest ${payment.id.startsWith('V-CREDIT-') ? 'text-blue-600' : 'text-amber-600'}`}>
                  {payment.id.startsWith('V-CREDIT-') ? 'System Requirement' : 'Customer Remark'}
                </p>
                <p className={`text-sm font-medium italic mt-0.5 ${payment.id.startsWith('V-CREDIT-') ? 'text-blue-800' : 'text-amber-800'}`}>{payment.remarks}</p>
              </div>
            </div>
          )}

          {/* ── PROOF LINK — only for non-virtual ── */}
          {!payment.id.startsWith('V-CREDIT-') && (
            <div className="bg-slate-900 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Payment Proof (Google Drive)</p>
              {payment.proofDriveLink ? (
                <a
                  href={payment.proofDriveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-black text-sm transition-all hover:scale-[1.01] active:scale-95"
                >
                  <ExternalLink size={18} />
                  Open Proof in Google Drive
                </a>
              ) : (
                <p className="text-sm text-slate-400 italic">No proof link submitted.</p>
              )}
            </div>
          )}

          {/* Rejection reason if rejected */}
          {payment.status === 'REJECTED' && payment.rejectionReason && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Rejection Reason</p>
              <p className="text-sm font-bold text-red-700">{payment.rejectionReason}</p>
            </div>
          )}

          {/* Action buttons — only for PENDING */}
          {isPending && mode === 'view' && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={onApprove}
                disabled={actioning}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
              >
                {actioning ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                {payment.id.startsWith('V-CREDIT-') ? 'Verify Credit Transaction' : 'Approve Payment'}
              </button>
              <button
                onClick={() => setMode('reject')}
                disabled={actioning}
                className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <XCircle size={15} />
                Reject {payment.id.startsWith('V-CREDIT-') ? 'Transaction' : 'Payment'}
              </button>
            </div>
          )}

          {/* Rejection form */}
          {isPending && mode === 'reject' && (
            <div className="space-y-4 pt-2 animate-in slide-in-from-bottom-5 duration-300">
              <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
                <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Specify Rejection Reason</p>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g., UTR not matching, Cheque bounced, Insufficient credit balance..."
                  className="w-full bg-white rounded-xl border border-red-200 p-4 text-sm focus:ring-2 focus:ring-red-500 outline-none min-h-[100px]"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => onReject(reason)}
                  disabled={actioning || !reason.trim()}
                  className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest disabled:opacity-40"
                >
                  Confirm Rejection
                </button>
                <button
                  onClick={() => setMode('view')}
                  className="px-8 bg-slate-100 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function AccountantPaymentsPage() {
  const {
    pendingPayments,
    allPayments,
    loading,
    approving,
    rejecting,
    handleApprove: hookApprove,
    handleReject: hookReject,
    refreshPayments,
  } = usePaymentApprovals();

  const [tab, setTab]                         = useState<'pending' | 'all'>('pending');
  const [search, setSearch]                   = useState('');
  const [actioning, setActioning]             = useState(false);
  const [selected, setSelected]               = useState<PaymentRecord | null>(null);
  const [globalStats, setGlobalStats]         = useState<GlobalStats | null>(null);

  // Auto-select payment if orderId is in query parameters
  useEffect(() => {
    const orderIdParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('orderId') : null;
    if (!orderIdParam) return;

    const baseIdParam = orderIdParam.split('-item')[0];
    const isMatch = (p: PaymentRecord) => {
      return (
        p.orderId === orderIdParam ||
        p.baseOrderId === orderIdParam ||
        p.orderId === baseIdParam ||
        p.baseOrderId === baseIdParam ||
        (Array.isArray(p.orderIds) && p.orderIds.includes(orderIdParam)) ||
        (Array.isArray(p.itemBreakdown) && p.itemBreakdown.some(item => item.orderId === orderIdParam))
      );
    };

    const match = pendingPayments.find(isMatch);
    if (match) {
      setSelected(match);
      return;
    }

    const matchAll = allPayments.find(isMatch);
    if (matchAll) {
      setSelected(matchAll);
      return;
    }

    // Fallback: If not found in payment records (e.g. ACDEMA proxy order), query db / Supabase directly
    const loadProxyOrderAsPayment = async () => {
      try {
        let ord: any = null;
        const isChild = Boolean(orderIdParam && orderIdParam.includes('-item'));

        // 1. Direct Firestore lookup - target orderIdParam first
        try {
          const snap = await getDoc(doc(db, 'orders', orderIdParam));
          if (snap.exists()) {
            ord = { id: snap.id, ...snap.data() };
          }
        } catch (e) {}

        if (!ord && !isChild && baseIdParam) {
          try {
            const baseSnap = await getDoc(doc(db, 'orders', baseIdParam));
            if (baseSnap.exists()) {
              ord = { id: baseSnap.id, ...baseSnap.data() };
            }
          } catch (e) {}
        }

        // 2. Direct Supabase lookup
        if (!ord) {
          const { data } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderIdParam)
            .single();
          if (data) ord = data;
        }

        if (ord) {
          let itemObj: any = null;
          let parsedItems: any[] = [];
          if (ord.items) {
            parsedItems = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items;
            itemObj = Array.isArray(parsedItems) ? parsedItems[0] : parsedItems;
          }

          if (isChild && !itemObj && baseIdParam) {
            const matchIdx = orderIdParam.match(/-item(\d+)/);
            if (matchIdx) {
              const idx = parseInt(matchIdx[1], 10) - 1;
              try {
                const parentSnap = await getDoc(doc(db, 'orders', baseIdParam));
                if (parentSnap.exists()) {
                  const pData = parentSnap.data() as any;
                  const pItems = typeof pData.items === 'string' ? JSON.parse(pData.items) : pData.items;
                  if (Array.isArray(pItems) && pItems[idx]) itemObj = pItems[idx];
                }
              } catch (e) {}
            }
          }

          const childGrandTotal = isChild
            ? (ord.grand_total_snapshot ?? ord.amounts?.grandTotal ?? ord.amounts?.total ?? (ord.item_amount ? ord.item_amount + (ord.allocated_logistics_amount || 0) + (ord.cgst_amount || 0) + (ord.sgst_amount || 0) + (ord.igst_amount || 0) : 0))
            : (ord.amounts?.grandTotal || 0);

          const itemAmt = isChild
            ? (ord.item_amount ?? ord.amounts?.productTotal ?? ord.amounts?.subTotal ?? itemObj?.pricingSnapshot?.subTotal ?? itemObj?.subTotal ?? childGrandTotal)
            : (ord.amounts?.productTotal ?? ord.amounts?.subTotal ?? childGrandTotal);

          const itemBreakdown = isChild
            ? [{
                orderId: ord.id,
                productName: ord.productName || itemObj?.productName || itemObj?.name || 'Order Item',
                quantity: itemObj?.specs?.quantity || itemObj?.quantity || 1,
                amount: itemAmt,
              }]
            : (parsedItems || []).map((it: any) => ({
                orderId: ord.id,
                productName: it.productName || it.name || 'Order Item',
                quantity: it.specs?.quantity || it.quantity || 1,
                amount: it.pricingSnapshot?.subTotal || it.subTotal || it.amount || 0,
              }));

          let proxyStaff = '';
          if (ord.proxyExecutor) {
            try {
              const proxy = typeof ord.proxyExecutor === 'string' ? JSON.parse(ord.proxyExecutor) : ord.proxyExecutor;
              proxyStaff = ord.proxyName || proxy?.name || proxy?.displayName || '';
            } catch (e) {}
          }

          const syntheticPayment: PaymentRecord = {
            id: `PROXY-${ord.id.replace('ORD-', '')}`,
            orderId: ord.id,
            baseOrderId: isChild ? '' : baseIdParam,
            itemBreakdown: itemBreakdown.length > 0 ? itemBreakdown : [{
              orderId: ord.id,
              productName: ord.productName || 'Order Item',
              quantity: 1,
              amount: childGrandTotal,
            }],
            userId: ord.customerId || '',
            paymentMode: ord.payment?.method || ord.paymentMethod || 'PROXY_SETTLEMENT',
            amount: childGrandTotal,
            ourBankAccount: 'DIRECT_SETTLEMENT',
            depositDate: ord.createdAt ? (typeof ord.createdAt === 'object' && ord.createdAt.seconds ? new Date(ord.createdAt.seconds * 1000).toISOString() : new Date(ord.createdAt).toISOString()) : new Date().toISOString(),
            depositBank: 'Cash / Credit Settlement',
            branchName: proxyStaff ? `Booked by ${proxyStaff}` : 'Staff Proxy Booking',
            proofDriveLink: '',
            remarks: `Staff Proxy Order booked for ${ord.customerSnapshot?.displayName || ord.customerSnapshot?.name || 'Customer'}.`,
            depositRefNo: ord.id,
            status: 'APPROVED',
            customerName: ord.customerSnapshot?.displayName || ord.customerSnapshot?.name || 'Customer',
            createdAt: ord.createdAt ? (typeof ord.createdAt === 'object' && ord.createdAt.seconds ? new Date(ord.createdAt.seconds * 1000).toISOString() : new Date(ord.createdAt).toISOString()) : new Date().toISOString(),
            approvedAt: ord.createdAt ? (typeof ord.createdAt === 'object' && ord.createdAt.seconds ? new Date(ord.createdAt.seconds * 1000).toISOString() : new Date(ord.createdAt).toISOString()) : new Date().toISOString(),
          };

          setSelected(syntheticPayment);
        }
      } catch (err) {
        console.error('Failed to load proxy order payment summary:', err);
      }
    };

    loadProxyOrderAsPayment();
  }, [pendingPayments, allPayments]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!selected) return;
    setActioning(true);
    const res = await hookApprove(selected.id);
    if (res.success) {
      toast.success('✅ Payment approved. Ledger updated & order advanced to production.');
      setSelected(null);
      const returnTo = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
      if (returnTo) {
        setTimeout(() => {
          window.location.href = returnTo;
        }, 1000);
      }
    } else {
      toast.error(res.error || 'Approval failed.');
    }
    setActioning(false);
  };

  const handleReject = async (reason: string) => {
    if (!selected) return;
    setActioning(true);
    const res = await hookReject(selected.id, reason);
    if (res.success) {
      toast.success('Payment rejected. Customer will see the reason.');
      setSelected(null);
      const returnTo = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
      if (returnTo) {
        setTimeout(() => {
          window.location.href = returnTo;
        }, 1000);
      }
    } else {
      toast.error(res.error || 'Rejection failed.');
    }
    setActioning(false);
  };

  // ── Filter ────────────────────────────────────────────────────────────────────
  const handleCloseViewer = useCallback(() => setSelected(null), []);

  useEffect(() => {
    let active = true;
    const loadStats = async () => {
      const { data, error } = await supabase
        .from('stats')
        .select('*')
        .eq('id', 'global')
        .maybeSingle();
      if (!active) return;
      if (data) setGlobalStats(data as GlobalStats);
    };
    void loadStats();

    const statsChannel = supabase
      .channel('accountant-payments-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stats' }, () => {
        void loadStats();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(statsChannel);
    };
  }, []);

  const source   = tab === 'pending' ? pendingPayments : allPayments;
  const filtered = (source || []).filter((p: PaymentRecord) =>
    !search ||
    p.id.toLowerCase().includes(search.toLowerCase()) ||
    (p.orderId || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.depositRefNo ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = pendingPayments.reduce((s, p) => s + p.amount, 0);

  const totalVerifiedToday = allPayments.filter(p => {
    if (p.status !== 'APPROVED' || !p.createdAt) return false;
    const d = (p.createdAt as any).seconds ? new Date((p.createdAt as any).seconds * 1000) : new Date(p.createdAt as any);
    return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  }).reduce((s, p) => s + p.amount, 0);

  return (
    <RoleGuard allowedRoles={['ADMIN', 'MANAGER', 'ACCOUNTANT']}>
      <div className="flex flex-col h-[calc(100vh-120px)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 p-4 overflow-hidden">
        
        {/* Compact Header & Stats */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 flex-shrink-0">
          <div className="xl:col-span-2 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[8px] font-black text-blue-500 uppercase tracking-[0.4em] mb-0.5">Customer Payments</p>
              <h1 className="text-[28px] font-bold font-black font-display tracking-tighter text-slate-900 leading-none">Payment Approvals</h1>
              <p className="text-slate-400 text-[10px] font-medium mt-1">
                {pendingPayments.length} pending · {fmt(totalPending)}
              </p>
            </div>
            <button
              onClick={refreshPayments}
              className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {[
            { label: 'Unverified', value: fmt(globalStats?.financial?.totalPendingVerification || 0), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Collected Verified', value: fmt(globalStats?.financial?.totalReceipts || 0), icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'System Health', value: '100%', icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' }
          ].map((stat, i) => (
            <div key={i} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center`}>
                <stat.icon size={14} />
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                <p className="text-sm font-black text-slate-900 tracking-tight leading-none">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Workspace */}
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
          {/* Action Bar */}
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between bg-slate-50/30 flex-shrink-0">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/50 rounded-xl">
              {(['pending', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    tab === t
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {t} ({t === 'pending' ? pendingPayments.length : allPayments.length})
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-md mx-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
              <input
                type="text"
                placeholder="Search ledger..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto scrollbar-hide relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="sticky top-0 z-10 bg-white border-b border-slate-100">
                  <tr className="bg-slate-50/50">
                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">ID / Date</th>
                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Job Ref</th>
                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mode / Ref</th>
                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Proof</th>
                    <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((p: PaymentRecord) => (
                    <tr key={p.id} className="hover:bg-blue-50/20 transition-colors group">
                      <td className="px-5 py-3 tabular-nums">
                        <p className="text-[10px] font-black text-blue-600 mb-0.5">{p.id}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">{fmtTs(p.createdAt)}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        <p className="text-[10px] font-black text-slate-700 uppercase">{p.orderId.slice(-10)}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500 transition-colors">
                            <User size={10} />
                          </div>
                          <p className="text-[10px] font-bold text-slate-600 truncate max-w-[120px]">{p.customerName || 'Direct Client'}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        <p className="text-[12px] font-black text-slate-900">{fmt(p.amount)}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[8px] font-black uppercase">{p.paymentMode}</span>
                          <span className="text-[9px] font-bold text-indigo-500 truncate max-w-[100px]">{p.depositRefNo}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center tabular-nums">
                        {p.proofDriveLink && (
                          <button 
                            onClick={() => window.open(p.proofDriveLink, '_blank')}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all"
                          >
                            <ExternalLink size={10} /> Link
                          </button>
                        )}
                        {!p.proofDriveLink && <span className="text-[9px] font-bold text-slate-300 uppercase italic">None</span>}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelected(p)}
                            className="w-7 h-7 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 rounded-lg flex items-center justify-center transition-all"
                          >
                            <Eye size={12} />
                          </button>
                          {p.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => setSelected(p)}
                                className="w-7 h-7 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg flex items-center justify-center transition-all"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setSelected(p)}
                                className="w-7 h-7 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-lg flex items-center justify-center transition-all"
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                          {p.status !== 'PENDING' && <StatusBadge status={p.status} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal Overlay */}
        {selected && (
          <PaymentModal
            payment={selected}
            onClose={() => setSelected(null)}
            onApprove={handleApprove}
            onReject={handleReject}
            actioning={actioning}
          />
        )}
      </div>
    </RoleGuard>
  );
}
