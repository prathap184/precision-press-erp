'use client';


import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { submitPayment, getPaymentsForOrder, getOrderSummary, getGroupOrderSummary, PaymentRecord } from '@/lib/actions/payments';
import toast from 'react-hot-toast';
import {
  CreditCard, Upload, Calendar, Building2, MapPin, FileText,
  CheckCircle2, Clock, XCircle, Loader2, ArrowLeft, Plus,
  ExternalLink, RefreshCw, AlertTriangle, IndianRupee, Landmark,
  Package, Layers
} from 'lucide-react';
import Link from 'next/link';
import { PaymentHistoryTable } from '@/components/dashboard/PaymentHistoryTable';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, orderBy } from '@/lib/supabase-firestore-shim';


type BankAccount = {
  id?: string;
  label: string;
  accountNumber?: string;
  ifsc?: string;
  description?: string;
  qrUrl?: string;
  payeeName?: string;
  upiId?: string;
  paymentType?: 'BANK_TRANSFER' | 'QR_PAY' | 'UPI_PAY';
};

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS = {
  PENDING:  { label: 'Pending Review',  color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: <Clock size={12} /> },
  APPROVED: { label: 'Approved',        color: 'bg-green-50  text-green-700  border-green-200',  icon: <CheckCircle2 size={12} /> },
  REJECTED: { label: 'Rejected',        color: 'bg-red-50    text-red-600    border-red-200',    icon: <XCircle size={12} /> },
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDate = (iso: string) =>
  iso ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—';

// ─── Empty form ────────────────────────────────────────────────────────────────
const EMPTY = {
  ourBankAccount: '',
  paymentMode:    '',
  amount:         '',
  proofDriveLink: '',
  depositDate:    '',
  depositBank:    '',
  branchName:     '',
  depositRefNo:   '',
  remarks:        '',
};

const inputCls = "w-full bg-slate-50 border-2 border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-300 placeholder:font-normal";
const selectCls = `${inputCls} cursor-pointer`;

// ─── Field component ──────────────────────────────────────────────────────
const Field = ({
  label, icon, required = false, children, hint
}: { label: string; icon: React.ReactNode; required?: boolean; children: React.ReactNode; hint?: string }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
      <span className="text-blue-500">{icon}</span>
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && <p className="text-[8px] text-slate-400 font-semibold leading-tight">{hint}</p>}
  </div>
);

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { profile } = useAuth();
  const router = useRouter();

  const [form, setForm]             = useState(EMPTY);
  const [payments, setPayments]     = useState<PaymentRecord[]>([]);
  const [orderInfo, setOrderInfo]   = useState<{ grandTotal: number; status: string; orderType: string; groupOrderIds?: string[]; amounts?: any; items?: any[] } | null>(null);
  const [groupSummary, setGroupSummary] = useState<any | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  // ── Load order + payments ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [order, history, banks] = await Promise.all([
        getOrderSummary(orderId),
        getPaymentsForOrder(orderId),
        getDocs(query(collection(db, 'bankAccounts'), orderBy('label'))),
      ]);
      setOrderInfo(order);
      setPayments(history);
      setBankAccounts(banks.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      
      // If it's a grouped order, load group summary details
      if (order && order.groupOrderIds && order.groupOrderIds.length > 0) {
        const summary = await getGroupOrderSummary(orderId);
        setGroupSummary(summary);
      } else {
        setGroupSummary(null);
      }

      // Auto-fill amount from order
      if (order) setForm(f => ({ ...f, amount: String(order.grandTotal) }));
    } catch (err) {
      console.error('[PaymentPage] load error', err);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await submitPayment({
        orderId,
        baseOrderId:    orderInfo?.groupOrderIds && orderInfo.groupOrderIds.length > 0 ? orderId : undefined,
        orderIds:       orderInfo?.groupOrderIds && orderInfo.groupOrderIds.length > 0 ? orderInfo.groupOrderIds : undefined,
        itemBreakdown:  groupSummary ? groupSummary.items.map((it: any) => ({
          orderId: it.orderId,
          productName: it.productName,
          quantity: it.quantity,
          amount: it.amount,
        })) : undefined,
        paymentMode:    form.paymentMode,
        amount:         parseFloat(form.amount) || 0,
        ourBankAccount: form.ourBankAccount,
        depositDate:    form.depositDate,
        depositBank:    form.depositBank,
        branchName:     form.branchName,
        proofDriveLink: form.proofDriveLink,
        remarks:        form.remarks,
        depositRefNo:   form.depositRefNo,
      });

      if (!res.success) {
        setFormError(res.error || 'Submission failed.');
        return;
      }

      toast.success(`Payment request ${res.paymentId} submitted! Pending accountant approval.`);
      router.push(`/dashboard/orders/${orderId}`);
    } catch (err: any) {
      setFormError(err.message || 'Unexpected error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm(f => ({ ...EMPTY, amount: f.amount }));
    setFormError(null);
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const totalPaid     = payments.filter(p => p.status === 'APPROVED').reduce((s, p) => s + p.amount, 0);
  const pendingAmount = payments.filter(p => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);
  const balance       = Math.max(0, (orderInfo?.grandTotal ?? 0) - totalPaid);
  // Lock form if fully paid OR if pending covers the rest
  const isFullyPaid   = orderInfo !== null && totalPaid >= (orderInfo?.grandTotal ?? 0);
  const isCovered     = orderInfo !== null && (totalPaid + pendingAmount) >= (orderInfo?.grandTotal ?? 0);
  const selectedPaymentAccount = bankAccounts.find(account => account.id === form.ourBankAccount);


  const displaySummary = groupSummary || (orderInfo?.amounts ? {
    items: orderInfo.amounts.items ? orderInfo.amounts.items.map((it: any) => ({
      orderId: orderId,
      productName: it.name || 'Order Item',
      quantity: it.quantity || 1,
      amount: it.baseAmount,
      finishAmount: it.finishAmount,
      cgst: it.cgst,
      sgst: it.sgst,
      igst: it.igst
    })) : (orderInfo.items || []).map((it: any) => ({
      orderId: orderId,
      productName: it.productName || it.name || 'Order Item',
      quantity: it.quantity || 1,
      amount: it.pricingSnapshot?.subTotal || it.subTotal || 0,
      finishAmount: it.pricingSnapshot?.eyeletRate ? it.pricingSnapshot.eyeletRate * (it.pricingSnapshot?.eyeletCount || 0) : 0,
      cgst: (orderInfo as any).cgst_amount || orderInfo.amounts?.cgst || 0,
      sgst: (orderInfo as any).sgst_amount || orderInfo.amounts?.sgst || 0,
      igst: (orderInfo as any).igst_amount || orderInfo.amounts?.igst || 0
    })),
    baseValue: orderInfo.amounts.productTotal || 0,
    finishValue: orderInfo.amounts.eyeletsTotal || 0,
    logistics: orderInfo.amounts.deliveryCharges || orderInfo.amounts.transport || 0,
    gst: (orderInfo.amounts.igst || 0) + (orderInfo.amounts.cgst || 0) + (orderInfo.amounts.sgst || 0),
    igst: orderInfo.amounts.igst || 0,
    cgst: orderInfo.amounts.cgst || 0,
    sgst: orderInfo.amounts.sgst || 0,
    grandTotal: orderInfo.amounts.grandTotal || 0,
  } : null);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-4">

      {/* ── Header ── */}
      <section className="space-y-2">
        <Link href={`/dashboard/orders`} className="inline-flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors">
          <ArrowLeft size={14} /> Back to Orders
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
          <div>
            <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.35em] mb-1">Payment Portal</p>
            <h1 className="text-[28px] font-bold md:text-3xl font-black font-display tracking-tighter text-slate-900">Submit Payment</h1>
            <p className="text-slate-400 font-medium mt-1 text-xs">Order <span className="font-black text-slate-700">{orderId}</span></p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </section>

      {/* ── Order Items Breakdown ── */}
      {displaySummary && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
            <Layers size={14} className="text-blue-500" />
            <h2 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Order Summary Breakdown</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {displaySummary.items.map((item: any, i: number) => {
              const itemIgst = item.igst || 0;
              const itemCgst = item.cgst || 0;
              const itemSgst = item.sgst || 0;
              const itemFinish = item.finishAmount || 0;
              
              return (
                <div key={item.orderId || i} className="px-5 py-4 flex flex-col gap-2 animate-in fade-in slide-in-from-left duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Package size={12} className="text-blue-500" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-800">{item.productName}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                          {item.orderId} · Qty: {item.quantity}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-black text-slate-900 tabular-nums">{fmt(item.amount)}</p>
                  </div>
                  
                  {/* Itemized Taxes & Finish */}
                  <div className="pl-10 space-y-1">
                    {itemIgst > 0 ? (
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                        <span>IGST</span>
                        <span>{fmt(itemIgst)}</span>
                      </div>
                    ) : (itemCgst > 0 || itemSgst > 0) ? (
                      <>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                          <span>CGST</span>
                          <span>{fmt(itemCgst)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                          <span>SGST</span>
                          <span>{fmt(itemSgst)}</span>
                        </div>
                      </>
                    ) : null}
                    {itemFinish > 0 && (
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                        <span>Finish (Eyelets)</span>
                        <span>{fmt(itemFinish)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            <div className="px-5 py-4 space-y-2 bg-slate-50/50">
              <div className="flex justify-between text-sm font-semibold text-slate-500">
                <span>Logistics</span>
                <span>{fmt(displaySummary.logistics)}</span>
              </div>
            </div>
          </div>
          {/* Total Row */}
          <div className="px-5 py-4 bg-blue-600 flex items-center justify-between">
            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Grand Total (All Items)</p>
            <p className="text-xl font-black text-white tabular-nums">{fmt(displaySummary.grandTotal)}</p>
          </div>
        </div>
      )}

      {/* ── Balance Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Order Total',    value: fmt(orderInfo?.grandTotal ?? 0), color: 'text-slate-700',  bg: 'bg-slate-50'   },
          { label: 'Approved',       value: fmt(totalPaid),                  color: 'text-green-700',  bg: 'bg-green-50'   },
          { label: 'Pending Review', value: fmt(pendingAmount),              color: 'text-yellow-700', bg: 'bg-yellow-50'  },
          { label: 'Balance Due',    value: fmt(balance < 0 ? 0 : balance),  color: balance > 0 ? 'text-red-600' : 'text-green-600', bg: balance > 0 ? 'bg-red-50' : 'bg-green-50' },
        ].map(item => (
          <div key={item.label} className={`rounded-2xl p-3 md:p-4 border border-white/60 shadow-sm ${item.bg}`}>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
            <p className={`text-lg md:text-xl font-black font-display tracking-tight ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* ── Fully Paid Banner — replaces form entirely ── */}
      {isFullyPaid && (
        <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 md:p-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={24} className="text-green-600" />
          </div>
          <div>
            <p className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-1">Order Fully Settled</p>
            <h3 className="text-lg font-black text-green-800 tracking-tight">Payment Complete ✓</h3>
            <p className="text-xs text-green-700 font-medium mt-1">
              This order has been fully paid ({fmt(orderInfo?.grandTotal ?? 0)}). No further payment is required.
            </p>
          </div>
        </div>
      )}

      {/* ── Covered-by-pending Banner ── */}
      {!isFullyPaid && isCovered && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-3 flex items-start gap-3">
          <Clock size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-black text-yellow-800">Submission Under Review</p>
            <p className="text-xs text-yellow-700 font-medium mt-1">
              Your pending submission(s) cover the full order amount. No additional payment needed until the accountant reviews. 
            </p>
          </div>
        </div>
      )}

      {/* ── Credit-only skip notice ── */}
      {orderInfo?.orderType === 'CREDIT' && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-start gap-3">
          <AlertTriangle size={20} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-black text-blue-700">Credit Account</p>
            <p className="text-xs text-blue-600 font-medium mt-1">
              Your account is on credit terms. Payment will be settled against your credit limit.
              You may still submit payment proof below if making an advance or partial payment.
            </p>
          </div>
        </div>
      )}

      {/* Only show form if NOT fully paid */}
      {!isFullyPaid && (
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">

        {/* ── PAYMENT FORM ── */}
        <form onSubmit={handleSubmit} className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

          {/* Form Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <div className={`w-9 h-9 ${isCovered ? 'bg-yellow-500' : 'bg-blue-600'} rounded-xl flex items-center justify-center`}>
              <CreditCard size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                {isCovered ? 'Additional Payment (Optional)' : 'New Payment Request'}
              </h2>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">All fields marked * are required</p>
            </div>
          </div>

          <div className="p-4 space-y-3">

            {/* Row 1: Payment Mode */}
            <div className="grid grid-cols-1 gap-3">
              <Field label="Payment Mode" icon={<CreditCard size={12} />} required>
                <select
                  required
                  value={form.ourBankAccount}
                  onChange={e => {
                    const accountId = e.target.value;
                    const selected = bankAccounts.find(b => b.id === accountId);
                    setForm(f => ({
                      ...f,
                      ourBankAccount: accountId,
                      paymentMode: selected?.paymentType || '',
                    }));
                  }}
                  className={selectCls}
                >
                  <option value="">— Select Payment Mode —</option>
                  {bankAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.paymentType === 'QR_PAY'
                        ? `Pay by QR — ${account.payeeName || account.label}`
                        : account.paymentType === 'UPI_PAY'
                          ? `Pay by UPI — ${account.payeeName || account.label}`
                          : `Direct Bank Transfer — ${account.label}${account.ifsc ? ` · IFSC: ${account.ifsc}` : ''}`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Row 2: Amount + Ref No */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Deposit Amount (₹)" icon={<IndianRupee size={12} />} required>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className={inputCls}
                />
              </Field>

              <Field label="Cheque / UTR / Reference No." icon={<FileText size={12} />}
                hint="Leave blank for cash deposits">
                <input
                  type="text"
                  placeholder="Ref number or UTR"
                  value={form.depositRefNo}
                  onChange={e => setForm(f => ({ ...f, depositRefNo: e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Row 3: Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Deposit Date" icon={<Calendar size={12} />} required>
                <input
                  required
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={form.depositDate}
                  onChange={e => setForm(f => ({ ...f, depositDate: e.target.value }))}
                  className={inputCls}
                />
              </Field>

              <Field label="Deposited Bank Name" icon={<Building2 size={12} />} required>
                <input
                  required
                  type="text"
                  placeholder="e.g. SBI, HDFC, Axis"
                  value={form.depositBank}
                  onChange={e => setForm(f => ({ ...f, depositBank: e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Row 4: Branch */}
            <Field label="Branch Name / Area" icon={<MapPin size={12} />}>
              <input
                type="text"
                placeholder="e.g. Andheri East Branch"
                value={form.branchName}
                onChange={e => setForm(f => ({ ...f, branchName: e.target.value }))}
                className={inputCls}
              />
            </Field>

            {/* Row 5: Proof Link */}
            <Field
              label="Payment Proof — Google Drive Link"
              icon={<Upload size={12} />}
              required
              hint="Upload screenshot/receipt to Google Drive → Share → Copy link → Paste here"
            >
              <div className="relative">
                <input
                  required
                  type="url"
                  placeholder="https://drive.google.com/file/d/..."
                  value={form.proofDriveLink}
                  onChange={e => setForm(f => ({ ...f, proofDriveLink: e.target.value }))}
                  className={`${inputCls} pr-28`}
                />
                {form.proofDriveLink.includes('drive.google.com') ? (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-green-600 uppercase tracking-widest flex items-center gap-1">
                    <CheckCircle2 size={12} /> Ready
                  </span>
                ) : (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Upload size={12} /> Paste
                  </span>
                )}
              </div>
              {form.proofDriveLink && !form.proofDriveLink.includes('drive.google.com') && (
                <p className="text-[9px] text-red-500 font-bold">Must be a Google Drive link</p>
              )}
            </Field>

            {/* Row 6: Remarks */}
            <Field label="Remarks / Special Requests" icon={<FileText size={12} />}>
              <textarea
                rows={3}
                placeholder="Any notes for the accounts team..."
                value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                className={`${inputCls} h-auto resize-none`}
              />
            </Field>

            {/* Error Banner */}
            {formError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 font-bold text-sm">{formError}</p>
              </div>
            )}

            {/* Submit Row */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || isCovered}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-11.5 rounded-lg font-black text-[9px] uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                  : isCovered
                    ? <><Clock size={16} /> Awaiting Review</>
                    : <><Plus size={16} /> Submit Payment Request</>
                }
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={submitting}
                className="px-4 h-11.5 rounded-lg border-2 border-slate-100 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:border-slate-300 transition-all active:scale-95"
              >
                Reset
              </button>
            </div>
          </div>
        </form>

        {/* ── INSTRUCTIONS SIDEBAR ── */}
        <div className="xl:col-span-2 space-y-3 xl:sticky xl:top-3">
          <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-4">
            <div>
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em] mb-1.5">How It Works</p>
              <h3 className="text-lg font-black font-display tracking-tight leading-tight">Payment<br />Workflow</h3>
            </div>
            <ol className="space-y-3">
              {[
                { n: '01', t: 'Submit Request',    d: 'Fill form with deposit details & proof link.' },
                { n: '02', t: 'Accounts Review',   d: 'Our team verifies within 1 business day.' },
                { n: '03', t: 'Approval',           d: 'Status changes to Approved in your history.' },
                { n: '04', t: 'Production Starts',  d: 'Order moves to the print queue automatically.' },
              ].map(step => (
                <li key={step.n} className="flex gap-4">
                  <span className="text-[9px] font-black text-blue-400 w-8 flex-shrink-0 pt-0.5">{step.n}</span>
                  <div>
                    <p className="font-black text-xs text-white">{step.t}</p>
                    <p className="text-[10px] text-white/50 font-medium mt-0.5">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="border-t border-white/10 pt-3 space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Our Bank Accounts</p>
              {selectedPaymentAccount ? (
                <div className="space-y-2">
                  <div className="bg-white/5 rounded-lg p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/50">{selectedPaymentAccount.paymentType === 'QR_PAY' ? 'QR Pay' : selectedPaymentAccount.paymentType === 'UPI_PAY' ? 'UPI Pay' : 'Bank Transfer'}</p>
                    <p className="text-[8px] font-bold text-white/70 leading-relaxed mt-1">{selectedPaymentAccount.label}</p>
                    {selectedPaymentAccount.payeeName && <p className="text-[8px] text-white/55 mt-1">Pay to: {selectedPaymentAccount.payeeName}</p>}
                    {selectedPaymentAccount.upiId && <p className="text-[8px] text-white/55 mt-1">UPI ID: {selectedPaymentAccount.upiId}</p>}
                    {selectedPaymentAccount.accountNumber && <p className="text-[8px] text-white/55 mt-1">A/C: {selectedPaymentAccount.accountNumber}</p>}
                    {selectedPaymentAccount.ifsc && <p className="text-[8px] text-white/55 mt-1">IFSC: {selectedPaymentAccount.ifsc}</p>}
                  </div>
                  {selectedPaymentAccount.qrUrl ? (
                    <div className="mx-auto max-w-[150px] rounded-lg overflow-hidden bg-white p-1.5">
                      <img src={selectedPaymentAccount.qrUrl} alt={selectedPaymentAccount.payeeName || selectedPaymentAccount.label} className="block w-full h-auto object-contain" />
                    </div>
                  ) : null}
                </div>
              ) : (
                bankAccounts.map(b => (
                  <div key={b.id} className="bg-white/5 rounded-lg p-2.5">
                    <p className="text-[8px] font-bold text-white/70 leading-relaxed">{b.label}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      )} {/* end !isFullyPaid */}

      {/* ── PAYMENT HISTORY TABLE (collapsed to save space) ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 font-black text-slate-700 uppercase tracking-widest text-[9px] border-b border-slate-100">
          Payment History
        </div>
        <div className="border-t-0">
          <PaymentHistoryTable filterOrderId={orderId} />
        </div>
      </div>
    </div>
  );
}


