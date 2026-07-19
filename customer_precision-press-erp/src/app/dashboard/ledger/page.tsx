'use client';


import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { 
  History, 
  Search, 
  Download, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  CreditCard,
  Building2,
  Calendar,
  Package,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  limit 
} from '@/lib/supabase-firestore-shim';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { Order } from '@/types/models';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { migrateCustomerFinancials } from '@/lib/actions/accounts';

interface Transaction {
  id: string;
  userId: string;
  type: 'SALE' | 'RECEIPT' | 'ADJUSTMENT' | 'OPENING';
  refId: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  remarks?: string;
  createdBy: string;
  timestamp: any;
  isVerified?: boolean;
}

const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const fmtDate = (v: any) => {
  if (!v) return '—';
  let d: Date;
  if (v?.seconds) d = new Date(v.seconds * 1000);
  else d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function CustomerLedgerPage() {
  const { profile } = useAuth();
  const { effectiveUserId, isImpersonating, simulatedUser } = useEffectiveUser(profile?.uid);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'SALES' | 'PAYMENTS'>('ALL');

  useEffect(() => {
    if (!effectiveUserId) return;

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', effectiveUserId),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      setTransactions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveUserId]);

  const orderedTimeline = [...transactions]
    .sort((a, b) => {
      const aTime = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp || 0).getTime();
      const bTime = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp || 0).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    })
    .map(tx => {
      return tx;
    });

  let runningBalance = 0;
  const timelineWithBalance = orderedTimeline.map((tx) => {
    if (tx.type === 'SALE') {
      runningBalance += tx.debit || 0;
    } else if (tx.type === 'RECEIPT' && tx.isVerified) {
      runningBalance -= tx.credit || 0;
    } else if (tx.type === 'OPENING') {
      runningBalance += (tx.debit || 0) - (tx.credit || 0);
    } else if (tx.type === 'ADJUSTMENT') {
      runningBalance += (tx.debit || 0) - (tx.credit || 0);
    }

    return {
      ...tx,
      computedBalance: runningBalance,
    } as Transaction & { computedBalance: number };
  });

  const filtered = timelineWithBalance.filter(tx => {
    if (activeTab === 'SALES') return tx.type === 'SALE';
    if (activeTab === 'PAYMENTS') return tx.type === 'RECEIPT';
    return true;
  });

  // When impersonating, use simulated customer's credit data — not the admin's
  const activeProfile = isImpersonating && simulatedUser ? simulatedUser : profile;
  const currentBalance = timelineWithBalance.length > 0
    ? timelineWithBalance[timelineWithBalance.length - 1].computedBalance
    : (activeProfile?.usedCredit || 0);
  const creditLimit = activeProfile?.creditLimit || 0;
  const purchaseLimit = Math.max(0, creditLimit - currentBalance);
  const percentUsed = creditLimit > 0 ? (currentBalance / creditLimit) * 100 : 0;
  const totalOrdered = transactions
    .filter(t => t.type === 'SALE')
    .reduce((s, t) => s + (t.debit || 0), 0);
  const ordersCount = transactions.filter(t => t.type === 'SALE').length;
  const verifiedPaid = transactions
    .filter(t => t.type === 'RECEIPT' && t.isVerified)
    .reduce((s, t) => s + (t.credit || 0), 0);
  const pendingVerification = transactions
    .filter(t => t.type === 'RECEIPT' && !t.isVerified)
    .reduce((s, t) => s + (t.credit || 0), 0);

  const dateRangeLabel = useMemo(() => {
    if (!timelineWithBalance.length) return 'No transactions yet';
    const firstDate = fmtDate(timelineWithBalance[0].timestamp);
    const lastDate = fmtDate(timelineWithBalance[timelineWithBalance.length - 1].timestamp);
    return firstDate === lastDate ? firstDate : `${firstDate} to ${lastDate}`;
  }, [timelineWithBalance]);

  return (
    <RoleGuard allowedRoles={['CUSTOMER']}>
      <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* Header Section */}
        <section className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_0.9fr] gap-3 text-slate-900">
            <div>
              <p className="text-[9px] uppercase tracking-[0.35em] text-slate-500">Ledger Vouchers</p>
              <h1 className="text-[28px] font-bold font-black uppercase tracking-tight">Ledger: Account Balance</h1>
            </div>

            <div className="flex flex-col justify-center text-center gap-1">
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-900">Hindustan Enterprises</p>
              <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">{dateRangeLabel}</p>
            </div>

            <div className="flex flex-col items-end justify-center gap-1 text-right">
              <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">Ledger Name</p>
              <p className="text-[10px] font-black uppercase text-slate-900">{activeProfile?.businessName || activeProfile?.name || 'Customer Ledger'}</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button className="bg-white text-slate-900 h-11 px-3 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border border-slate-100 shadow-sm hover:bg-slate-50 transition-all" type="button">
              <Download size={14} /> Statement
            </button>
            <button 
              onClick={async () => {
                try {
                  setAuditing(true);
                  await migrateCustomerFinancials(false);
                  alert('Audit completed. Missing transactions have been backfilled.');
                  window.location.reload();
                } catch(e: any) {
                  alert('Audit Failed: ' + e.message);
                } finally {
                  setAuditing(false);
                }
              }}
              disabled={auditing}
              className="bg-blue-600 text-white h-11 px-3 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60" 
              type="button"
            >
              {auditing ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />} {auditing ? 'Auditing...' : 'Request Audit'}
            </button>
          </div>
          <div className="text-right">
            <p className="text-[8px] uppercase tracking-[0.3em] text-slate-500">As on</p>
            <p className="text-[10px] font-black text-slate-900">{new Date().toLocaleDateString('en-IN')}</p>
          </div>
        </section>

        {/* Big Balance Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white p-6 md:p-7 rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/40 flex flex-col justify-between min-h-[180px]">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Available Credit</p>
              {creditLimit - currentBalance <= 0 ? (
                <div className="py-4">
                  <p className="text-xs font-bold text-slate-500">You do not have any available credit.</p>
                </div>
              ) : (
                <>
                  <h3 className="text-3xl font-black font-display tracking-tighter text-slate-900 italic">{fmt(creditLimit - currentBalance)}</h3>
                </>
              )}
            </div>
            {creditLimit > 0 ? (
              <div className="mt-5">
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2.5">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.max(0, (currentBalance / creditLimit) * 100))}%` }}
                  />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  {((Math.max(0, currentBalance) / Math.max(1, creditLimit)) * 100).toFixed(1)}% used
                </p>
              </div>
            ) : null}
          </div>

          <div className="bg-blue-600 p-6 md:p-7 rounded-[2rem] text-white shadow-2xl shadow-blue-500/30 flex flex-col justify-between min-h-[180px]">
            <div>
              <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1.5">Total Purchases</p>
              <h3 className="text-2xl md:text-3xl font-black font-display tracking-tighter italic">{ordersCount} Invoices <span className="text-lg">({fmt(totalOrdered)})</span></h3>
              <p className="mt-2 text-xs font-bold">Total Receipts: <span className="font-display italic">{fmt(verifiedPaid)}</span></p>
              {pendingVerification > 0 && (
                <p className="mt-2 text-xs font-bold">Pending Receipts: <span className="font-display italic">{fmt(pendingVerification)}</span></p>
              )}
              <p className="mt-2 text-xs font-bold">
                {totalOrdered - verifiedPaid - pendingVerification > 0 ? 'Remaining Due' : 'Remaining Credit'}: <span className="font-display italic text-emerald-200">{fmt(Math.abs(totalOrdered - verifiedPaid - pendingVerification))}</span>
              </p>
            </div>
            <div className="mt-auto">
               <p className="text-[9px] font-bold text-blue-100 opacity-60 leading-relaxed mt-3">
                 Track your invoices and payments to ensure your account remains in good standing.
               </p>
            </div>
          </div>
        </section>

        {/* Ledger Table Section */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-50 flex flex-wrap gap-4 items-center justify-between">
             <div className="flex items-center gap-4">
               <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-900 italic underline decoration-blue-500 decoration-4 underline-offset-6">Statement Stream</h3>
               <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 gap-1">
                 {(['ALL', 'SALES', 'PAYMENTS'] as const).map(t => (
                   <button 
                     key={t}
                     onClick={() => setActiveTab(t)}
                     className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${
                       activeTab === t ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'
                     }`}
                   >
                     {t}
                   </button>
                 ))}
               </div>
             </div>
             
             <div className="relative">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input 
                  type="text"
                  placeholder="Find Transaction..."
                className="bg-slate-50 border border-slate-100 rounded-2xl pl-10 pr-5 h-11.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/5 transition-all w-56"
                />
             </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-3xl">
            <table className="min-w-full border-collapse text-[10px] bg-white">
              <thead>
                <tr className="bg-slate-100 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
                  <th className="border border-slate-300 px-2.5 py-2">Timeline</th>
                  <th className="border border-slate-300 px-2.5 py-2">Transaction Type</th>
                  <th className="border border-slate-300 px-2.5 py-2">Order Ref</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Debit (+)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Credit (-)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center tabular-nums">
                      <Loader2 className="animate-spin inline-block text-blue-500 mb-2" />
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Auditing Vault...</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center tabular-nums">
                       <History size={32} className="text-slate-200 mx-auto mb-4" />
                       <p className="text-sm font-bold text-slate-400">Statement history is currently empty.</p>
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtered.map((tx) => (
                      <tr key={tx.id} className="group hover:bg-slate-50 transition-colors">
                        <td className="border border-slate-300 px-2.5 py-2 align-top tabular-nums">
                          <p className="text-[10px] font-black text-slate-900 tracking-tight">{fmtDate(tx.timestamp)}</p>
                          <p className="text-[8px] font-bold text-slate-400 italic">TX_{tx.id.slice(-6).toUpperCase()}</p>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 align-top tabular-nums">
                          <div className="flex items-start gap-2">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${tx.type === 'SALE' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                              {tx.type === 'SALE' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.16em]">
                                {tx.type === 'SALE' ? 'INVOICE' : tx.type} {tx.type === 'RECEIPT' ? `RC-${tx.id.slice(-6).toUpperCase()}` : ''}
                              </p>
                              {tx.isVerified ? <p className="text-[8px] font-semibold text-emerald-600 uppercase tracking-[0.24em]">Verified</p> : null}
                              <p className="text-[9px] text-slate-400">{tx.remarks || 'Standard Transaction'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 align-top tabular-nums">
                          <Link
                            href={tx.refId?.startsWith('ORD-') ? `/dashboard/orders/${tx.refId}` : '#'}
                            className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {tx.refId || '-'}
                            {tx.refId?.startsWith('ORD-') && <ChevronRight size={10} />}
                          </Link>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 text-right align-top tabular-nums">
                          <span className={`text-[10px] font-black ${tx.debit > 0 ? 'text-red-500' : 'text-slate-300 opacity-20'}`}>{tx.debit > 0 ? `+${fmt(tx.debit)}` : '—'}</span>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 text-right align-top tabular-nums">
                          <span className={`text-[10px] font-black ${tx.credit > 0 ? 'text-green-500' : 'text-slate-300 opacity-20'}`}>{tx.credit > 0 ? `-${fmt(tx.credit)}` : '—'}</span>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 text-right font-black font-display italic text-slate-900 align-top tabular-nums">
                          {fmt(Math.abs((tx as Transaction & { computedBalance: number }).computedBalance))}
                          <span className="text-[8px] text-slate-500 ml-1 font-sans not-italic">
                            {(tx as Transaction & { computedBalance: number }).computedBalance < 0 ? '(Cr)' : '(Dr)'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filtered.length > 0 && (
                      <tr className="bg-slate-100">
                        <td className="border border-slate-300 px-2.5 py-2 font-black uppercase tracking-[0.18em] text-slate-700 tabular-nums">Totals</td>
                        <td className="border border-slate-300 px-2.5 py-2 tabular-nums" />
                        <td className="border border-slate-300 px-2.5 py-2 tabular-nums" />
                        <td className="border border-slate-300 px-2.5 py-2 text-right font-black text-slate-900 tabular-nums">{fmt(totalOrdered)}</td>
                        <td className="border border-slate-300 px-2.5 py-2 text-right font-black text-slate-900 tabular-nums">{fmt(verifiedPaid)}</td>
                        <td className="border border-slate-300 px-2.5 py-2 text-right font-black text-slate-900 tabular-nums">
                          {fmt(Math.abs(currentBalance))}
                          <span className="text-[8px] text-slate-500 ml-1">
                            {currentBalance < 0 ? '(Cr)' : '(Dr)'}
                          </span>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Summary Footer */}
          {!loading && filtered.length > 0 && (
            <div className="bg-slate-900 px-6 py-6 flex flex-wrap border-t border-slate-800 items-baseline justify-between transition-all gap-8">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Opening Balance</p>
                  <p className="text-xl font-black text-white italic">{fmt(0)}</p>
                </div>
                <div className="w-px h-10 bg-slate-800 hidden md:block" />
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Sales</p>
                  <p className="text-xl font-black text-white italic">{fmt(totalOrdered)}</p>
                </div>
                <div className="w-px h-10 bg-slate-800 hidden md:block" />
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Receipts</p>
                  <p className="text-xl font-black text-white italic">{fmt(verifiedPaid)}</p>
                </div>
                <div className="w-px h-10 bg-slate-800 hidden md:block" />
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Outstanding Amount</p>
                  <p className="text-xl font-black text-white italic">{fmt(Math.max(0, currentBalance))}</p>
                </div>
                <div className="w-px h-10 bg-slate-800 hidden lg:block" />
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Customer Advance</p>
                  <p className="text-3xl font-black text-white underline decoration-blue-500 decoration-double decoration-4 underline-offset-8 italic font-display">
                    {fmt(currentBalance < 0 ? Math.abs(currentBalance) : 0)}
                  </p>
                </div>
            </div>
          )}
        </div>

        {/* Note Section */}
          <div className="flex items-center gap-4 bg-amber-50 p-4 rounded-2xl border border-amber-100">
           <AlertCircle className="text-amber-500 shrink-0" size={20} />
            <p className="text-[11px] font-medium text-amber-900 leading-relaxed">
             <span className="font-black uppercase tracking-widest mr-2">Policy Note:</span>
             All sales entries strictly increase your outstanding debit. Receipt entries represent your successful payments verified by our accounts. If you find any discrepancies, please download the statement and contact the Billing Manager.
           </p>
        </div>

      </div>
    </RoleGuard>
  );
}

