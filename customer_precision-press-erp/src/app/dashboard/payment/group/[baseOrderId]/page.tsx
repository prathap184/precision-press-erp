'use client';


import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  submitPayment,
  getPaymentsForOrder,
  getGroupOrderSummary,
  PaymentRecord,
} from '@/lib/actions/payments';
import toast from 'react-hot-toast';
import {
  CreditCard, Upload, Calendar, Building2, MapPin, FileText,
  CheckCircle2, Clock, XCircle, Loader2, ArrowLeft, Plus,
  RefreshCw, AlertTriangle, IndianRupee, Package, Layers,
} from 'lucide-react';
import Link from 'next/link';
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

type GroupSummary = {
  baseOrderId: string;
  grandTotal: number;
  baseValue: number;
  finishValue: number;
  logistics: number;
  gst: number;
  customerName: string;
  customerId: string;
  orderType: string;
  items: {
    orderId: string;
    productName: string;
    quantity: number;
    amount: number;
    status: string;
    paymentStatus: string;
  }[];
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const inputCls = 'w-full bg-slate-50 border-2 border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:bg-white transition-all placeholder:text-slate-300 placeholder:font-normal';
const selectCls = `${inputCls} cursor-pointer`;

const EMPTY = {
  ourBankAccount: '',
  paymentMode: '',
  proofDriveLink: '',
  depositDate: '',
  depositBank: '',
  branchName: '',
  depositRefNo: '',
  remarks: '',
};

const Field = ({
  label, icon, required = false, children, hint,
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

export default function GroupPaymentPage() {
  const { baseOrderId } = useParams<{ baseOrderId: string }>();
  const { profile } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState(EMPTY);
  const [groupSummary, setGroupSummary] = useState<GroupSummary | null>(null);
  const [existingPayments, setExistingPayments] = useState<PaymentRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, banks] = await Promise.all([
        getGroupOrderSummary(baseOrderId),
        getDocs(query(collection(db, 'bankAccounts'), orderBy('label'))),
      ]);
      setGroupSummary(summary);
      setBankAccounts(banks.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      // Fetch existing payments submitted for this group (using baseOrderId as the key)
      const payments = await getPaymentsForOrder(baseOrderId);
      setExistingPayments(payments);
    } catch (err) {
      console.error('[GroupPaymentPage] load error', err);
    }
    setLoading(false);
  }, [baseOrderId]);

  useEffect(() => { load(); }, [load]);

  const totalPaid = existingPayments.filter(p => p.status === 'APPROVED').reduce((s, p) => s + p.amount, 0);
  const pendingAmount = existingPayments.filter(p => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);
  const grandTotal = groupSummary?.grandTotal ?? 0;
  const balance = Math.max(0, grandTotal - totalPaid);
  const isFullyPaid = totalPaid >= grandTotal && grandTotal > 0;
  const isCovered = (totalPaid + pendingAmount) >= grandTotal && grandTotal > 0;

  const selectedAccount = bankAccounts.find(b => b.id === form.ourBankAccount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupSummary) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await submitPayment({
        orderId: baseOrderId,          // Primary ref
        baseOrderId,                   // Explicit group ID
        orderIds: groupSummary.items.map(it => it.orderId),
        itemBreakdown: groupSummary.items.map(it => ({
          orderId: it.orderId,
          productName: it.productName,
          quantity: it.quantity,
          amount: it.amount,
        })),
        paymentMode: form.paymentMode,
        amount: grandTotal,            // Always pay the full group total
        ourBankAccount: form.ourBankAccount,
        depositDate: form.depositDate,
        depositBank: form.depositBank,
        branchName: form.branchName,
        proofDriveLink: form.proofDriveLink,
        depositRefNo: form.depositRefNo,
        remarks: form.remarks,
      });

      if (!res.success) {
        setFormError(res.error || 'Submission failed.');
        return;
      }

      toast.success(`✅ Payment ${res.paymentId} submitted! Pending accountant approval.`);
      router.push('/dashboard/orders');
    } catch (err: any) {
      setFormError(err.message || 'Unexpected error.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!groupSummary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={40} className="text-amber-500" />
        <p className="text-slate-600 font-bold">Group order not found.</p>
        <Link href="/dashboard/orders" className="text-blue-600 font-black text-sm hover:underline">
          ← Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-8">

      {/* ── Header ── */}
      <section className="space-y-2">
        <Link href="/dashboard/orders" className="inline-flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors">
          <ArrowLeft size={14} /> Back to Orders
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
          <div>
            <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.35em] mb-1">Group Payment Portal</p>
            <h1 className="text-[28px] font-bold md:text-3xl font-black font-display tracking-tighter text-slate-900">Submit Payment</h1>
            <p className="text-slate-400 font-medium mt-1 text-xs">
              Group Order <span className="font-black text-slate-700">{baseOrderId}</span>
              <span className="ml-2 text-slate-400">· {groupSummary.items.length} items</span>
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </section>

      {/* ── Order Items Breakdown ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
          <Layers size={14} className="text-blue-500" />
          <h2 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Order Items</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {groupSummary.items.map((item, idx) => (
            <div key={item.orderId} className="px-5 py-3 flex items-center justify-between">
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
          ))}
          
          <div className="px-5 py-4 space-y-2 bg-slate-50/50">
            <div className="flex justify-between text-sm font-semibold text-slate-500">
              <span>Base Value</span>
              <span>{fmt(groupSummary.baseValue)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-slate-500">
              <span>Finish (Eyelets)</span>
              <span>{fmt(groupSummary.finishValue)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-slate-500">
              <span>Logistics</span>
              <span>{fmt(groupSummary.logistics)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-slate-500">
              <span>GST 18%</span>
              <span>{fmt(groupSummary.gst)}</span>
            </div>
          </div>
        </div>
        {/* Total Row */}
        <div className="px-5 py-4 bg-blue-600 flex items-center justify-between">
          <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Grand Total (All Items)</p>
          <p className="text-xl font-black text-white tabular-nums">{fmt(grandTotal)}</p>
        </div>
      </div>

      {/* ── Payment Status Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {[
          { label: 'Total Due', value: fmt(grandTotal), color: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Paid & Approved', value: fmt(totalPaid), color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Balance', value: fmt(balance < 0 ? 0 : balance), color: balance > 0 ? 'text-red-600' : 'text-green-600', bg: balance > 0 ? 'bg-red-50' : 'bg-green-50' },
        ].map(item => (
          <div key={item.label} className={`rounded-2xl p-3 border border-white/60 shadow-sm ${item.bg}`}>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
            <p className={`text-lg font-black font-display tracking-tight ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* ── Fully Paid Banner ── */}
      {isFullyPaid && (
        <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 md:p-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={24} className="text-green-600" />
          </div>
          <div>
            <p className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-1">Fully Settled</p>
            <h3 className="text-lg font-black text-green-800 tracking-tight">Payment Complete ✓</h3>
            <p className="text-xs text-green-700 font-medium mt-1">
              All {groupSummary.items.length} items have been fully paid ({fmt(grandTotal)}).
            </p>
          </div>
        </div>
      )}

      {/* ── Pending Coverage Banner ── */}
      {!isFullyPaid && isCovered && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-2xl p-3 flex items-start gap-3">
          <Clock size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-black text-yellow-800">Payment Under Review</p>
            <p className="text-xs text-yellow-700 font-medium mt-1">
              Your pending submission covers the full amount. No additional payment needed until the accountant reviews.
            </p>
          </div>
        </div>
      )}

      {/* ── Payment Form ── */}
      {!isFullyPaid && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
          <form onSubmit={handleSubmit} className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <div className={`w-9 h-9 ${isCovered ? 'bg-yellow-500' : 'bg-blue-600'} rounded-xl flex items-center justify-center`}>
                <CreditCard size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">
                  {isCovered ? 'Additional Payment (Optional)' : `Submit Full Payment — ${fmt(grandTotal)}`}
                </h2>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">One payment covers all {groupSummary.items.length} items</p>
              </div>
            </div>

            <div className="p-4 space-y-3">

              {/* Payment Mode */}
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

              {/* Amount (read-only total) */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IndianRupee size={14} className="text-blue-500" />
                  <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Total Amount to Pay</p>
                </div>
                <p className="text-lg font-black text-blue-800 tabular-nums">{fmt(grandTotal)}</p>
              </div>

              {/* Ref No + Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Cheque / UTR / Reference No." icon={<FileText size={12} />} hint="Leave blank for cash">
                  <input
                    type="text"
                    placeholder="Ref number or UTR"
                    value={form.depositRefNo}
                    onChange={e => setForm(f => ({ ...f, depositRefNo: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
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
              </div>

              {/* Bank */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                <Field label="Branch Name / Area" icon={<MapPin size={12} />}>
                  <input
                    type="text"
                    placeholder="e.g. Andheri East Branch"
                    value={form.branchName}
                    onChange={e => setForm(f => ({ ...f, branchName: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
              </div>

              {/* Proof Link */}
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

              {/* Remarks */}
              <Field label="Remarks / Notes" icon={<FileText size={12} />}>
                <textarea
                  rows={2}
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

              {/* Submit */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting || isCovered}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                    : isCovered
                      ? <><Clock size={16} /> Awaiting Review</>
                      : <><Plus size={16} /> Submit Payment — {fmt(grandTotal)}</>
                  }
                </button>
              </div>
            </div>
          </form>

          {/* ── Sidebar ── */}
          <div className="xl:col-span-2 space-y-3 xl:sticky xl:top-3">
            <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-4">
              <div>
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em] mb-1.5">How It Works</p>
                <h3 className="text-lg font-black font-display tracking-tight leading-tight">Group<br />Payment</h3>
              </div>
              <ol className="space-y-3">
                {[
                  { n: '01', t: 'Single Payment', d: `Pay ${fmt(grandTotal)} once for all ${groupSummary.items.length} items.` },
                  { n: '02', t: 'Accounts Review', d: 'Our team verifies within 1 business day.' },
                  { n: '03', t: 'All Orders Unlock', d: 'All items move to production simultaneously.' },
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

              {selectedAccount && (
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment To</p>
                  <div className="bg-white/5 rounded-lg p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/50">
                      {selectedAccount.paymentType === 'QR_PAY' ? 'QR Pay' : selectedAccount.paymentType === 'UPI_PAY' ? 'UPI Pay' : 'Bank Transfer'}
                    </p>
                    <p className="text-[8px] font-bold text-white/70 leading-relaxed mt-1">{selectedAccount.label}</p>
                    {selectedAccount.payeeName && <p className="text-[8px] text-white/55 mt-1">Pay to: {selectedAccount.payeeName}</p>}
                    {selectedAccount.upiId && <p className="text-[8px] text-white/55 mt-1">UPI: {selectedAccount.upiId}</p>}
                    {selectedAccount.accountNumber && <p className="text-[8px] text-white/55 mt-1">A/C: {selectedAccount.accountNumber}</p>}
                    {selectedAccount.ifsc && <p className="text-[8px] text-white/55 mt-1">IFSC: {selectedAccount.ifsc}</p>}
                  </div>
                  {selectedAccount.qrUrl && (
                    <div className="mx-auto max-w-[140px] rounded-lg overflow-hidden bg-white p-1.5">
                      <img src={selectedAccount.qrUrl} alt={selectedAccount.label} className="block w-full h-auto object-contain" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
