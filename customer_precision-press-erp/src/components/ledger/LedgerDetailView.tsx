'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, collection, query, where, onSnapshot } from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { Order } from '@/types/models';
import { UserProfile } from '@/types/auth';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { RoleGuard } from '@/lib/role-guard';
import { migrateCustomerFinancials } from '@/lib/actions/accounts';
import { Download, History, Search, TrendingUp, TrendingDown, Loader2, AlertCircle, ChevronRight } from 'lucide-react';

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

const safeParseTime = (v: any) => {
  if (!v) return 0;
  if (v?.seconds) return v.seconds * 1000;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

function LedgerDetailBody({
  targetUserId,
  backHref,
  backLabel = 'Customer List',
  showBreadcrumb = false,
}: {
  targetUserId: string;
  backHref: string;
  backLabel?: string;
  showBreadcrumb?: boolean;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'SALES' | 'PAYMENTS'>('ALL');
  const [downloading, setDownloading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!targetUserId) return;

    const profileRef = doc(db, 'profiles', targetUserId);
    const unsubProfile = onSnapshot(profileRef, (snapshot) => {
      setProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
    });

    setLoading(true);
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', targetUserId)
    );

    const unsubscribeTx = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Transaction[];

        setTransactions(data);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load ledger transactions', error);
        setLoading(false);
      }
    );

    return () => {
      unsubProfile();
      unsubscribeTx();
    };
  }, [targetUserId]);

  const timelineWithBalance = useMemo(() => {
    let runningBalance = 0;
    return transactions
      .slice()
      .sort((a, b) => {
        const aTime = safeParseTime(a.timestamp);
        const bTime = safeParseTime(b.timestamp);
        if (aTime !== bTime) return aTime - bTime;
        return a.id.localeCompare(b.id);
      })
      .map((tx) => {
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
  }, [transactions]);

  const filtered = timelineWithBalance.filter((tx) => {
    if (activeTab === 'SALES') return tx.type === 'SALE';
    if (activeTab === 'PAYMENTS') return tx.type === 'RECEIPT';
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      tx.id.toLowerCase().includes(q) ||
      tx.refId.toLowerCase().includes(q) ||
      (tx.remarks || '').toLowerCase().includes(q)
    );
  });

  const totals = useMemo(() => {
    const totalOrdered = transactions.filter((t) => t.type === 'SALE').reduce((sum, t) => sum + (t.debit || 0), 0);
    const ordersCount = transactions.filter((t) => t.type === 'SALE').length;
    const verifiedPaid = transactions.filter((t) => t.type === 'RECEIPT' && t.isVerified).reduce((sum, t) => sum + (t.credit || 0), 0);
    const pendingVerification = transactions.filter((t) => t.type === 'RECEIPT' && !t.isVerified).reduce((sum, t) => sum + (t.credit || 0), 0);
    const currentBalance = timelineWithBalance.length ? timelineWithBalance[timelineWithBalance.length - 1].computedBalance : (profile?.usedCredit ?? 0);
    const creditLimit = profile?.creditLimit ?? 0;
    return { totalOrdered, ordersCount, verifiedPaid, pendingVerification, currentBalance, creditLimit };
  }, [profile, transactions, timelineWithBalance]);

  const dateRangeLabel = useMemo(() => {
    if (!timelineWithBalance.length) return 'No transactions yet';
    const firstDate = fmtDate(timelineWithBalance[0].timestamp);
    const lastDate = fmtDate(timelineWithBalance[timelineWithBalance.length - 1].timestamp);
    return firstDate === lastDate ? firstDate : `${firstDate} to ${lastDate}`;
  }, [timelineWithBalance]);

  const downloadStatement = async () => {
    setDownloading(true);
    try {
      const rows = timelineWithBalance.map((tx) => [
        fmtDate(tx.timestamp),
        tx.type,
        tx.refId,
        tx.debit || 0,
        tx.credit || 0,
        tx.computedBalance,
        tx.remarks || '',
      ]);
      const csv = [
        ['Timeline', 'Transaction Type', 'Order Ref', 'Debit', 'Credit', 'Balance', 'Remarks'],
        ...rows,
      ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger-${targetUserId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const openOrder = (orderId: string) => {
    if (!orderId.startsWith('ORD-')) return;
    router.push(`/dashboard/orders/${orderId}`);
  };

  return (
    <div className="space-y-4 pb-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {showBreadcrumb && (
        <div className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400 flex items-center gap-2">
          <Link href="/accountant/ledger" className="hover:text-slate-700 transition-colors">Accounts Ledger</Link>
          <span>→</span>
          <span className="text-slate-600">Customer Ledger</span>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_0.9fr] gap-3 text-slate-900">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-slate-500">Ledger Vouchers</p>
            <h1 className="text-[28px] font-bold font-black uppercase tracking-tight">Ledger: Purchases</h1>
          </div>

          <div className="flex flex-col justify-center text-center gap-1">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-900">Hindustan Enterprises</p>
            <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">{dateRangeLabel}</p>
          </div>

          <div className="flex flex-col items-end justify-center gap-1 text-right">
            <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">Ledger Name</p>
            <p className="text-[10px] font-black uppercase text-slate-900">{profile?.name || 'Customer Ledger'}</p>
          </div>
        </div>
      </section>
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadStatement}
            disabled={downloading}
            className="bg-white text-slate-900 h-11 px-3 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border border-slate-100 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-60"
          >
            <Download size={14} /> {downloading ? 'Preparing...' : 'Statement'}
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
          >
            {auditing ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />} {auditing ? 'Auditing...' : 'Request Audit'}
          </button>
        </div>
        <div className="text-right">
          <p className="text-[8px] uppercase tracking-[0.3em] text-slate-500">As on</p>
          <p className="text-[10px] font-black text-slate-900">{new Date().toLocaleDateString('en-IN')}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.18em] mb-1">Available Credit</p>
            {totals.creditLimit - totals.currentBalance <= 0 ? (
              <div className="py-2">
                <p className="text-[11px] font-semibold text-slate-500">No available credit.</p>
              </div>
            ) : (
              <h3 className="text-xl font-black font-display tracking-tight text-slate-900">{fmt(totals.creditLimit - totals.currentBalance)}</h3>
            )}
          </div>
          {totals.creditLimit > 0 ? (
            <div className="mt-3">
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, (totals.currentBalance / totals.creditLimit) * 100))}%` }} />
              </div>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.18em]">{((Math.max(0, totals.currentBalance) / Math.max(1, totals.creditLimit)) * 100).toFixed(1)}% used</p>
            </div>
          ) : null}
        </div>

        <div className="bg-blue-600 p-2.5 rounded-2xl text-white shadow-lg shadow-blue-500/15 flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black text-blue-200 uppercase tracking-[0.18em] mb-1">Total Purchases</p>
            <h3 className="text-lg font-black font-display tracking-tight">{totals.ordersCount} Invoices <span className="text-sm">({fmt(totals.totalOrdered)})</span></h3>
            <p className="mt-1 text-[11px] font-semibold">Total Paid: <span className="font-display italic">{fmt(totals.verifiedPaid)}</span></p>
            {totals.pendingVerification > 0 && (
              <p className="mt-1 text-[11px] font-semibold">Pending verification: <span className="font-display italic">{fmt(totals.pendingVerification)}</span></p>
            )}
            <p className="mt-1 text-[11px] font-semibold">
              {totals.totalOrdered - totals.verifiedPaid - totals.pendingVerification > 0 ? 'Remaining Due' : 'Remaining Credit'}: <span className="font-display italic text-emerald-200">{fmt(Math.abs(totals.totalOrdered - totals.verifiedPaid - totals.pendingVerification))}</span>
            </p>
          </div>
          <div className="mt-2">
            <p className="text-[9px] font-semibold text-blue-100/90 leading-snug">Verified payments are confirmed by the shop. Pending receipts await confirmation.</p>
          </div>
        </div>
      </section>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-900 italic underline decoration-blue-500 decoration-4 underline-offset-6">Statement Stream</h3>
            <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 gap-1">
              {(['ALL', 'SALES', 'PAYMENTS'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === t ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              type="text"
              placeholder="Find Transaction..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-100 rounded-2xl pl-9 pr-4 py-2 text-[10px] font-bold text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/5 transition-all w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-3xl">
          <table className="min-w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] h-9">
                <th className="border border-slate-300 px-2.5 py-2">Timeline</th>
                <th className="border border-slate-300 px-2.5 py-2">Transaction Type</th>
                <th className="border border-slate-300 px-2.5 py-2">Order Ref</th>
                <th className="border border-slate-300 px-2.5 py-2 text-right">Debit (+)</th>
                <th className="border border-slate-300 px-2.5 py-2 text-right">Credit (-)</th>
                <th className="border border-slate-300 px-2.5 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white">
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
                    <tr key={tx.id} className="group hover:bg-slate-50 transition-colors h-9">
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
                          </div>
                        </div>
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 align-top tabular-nums">
                        <button
                          type="button"
                          onClick={() => openOrder(tx.refId)}
                          className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {tx.refId}
                          {tx.refId.startsWith('ORD-') && <ChevronRight size={10} />}
                        </button>
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
                    <tr className="bg-slate-100 h-9">
                      <td className="border border-slate-300 px-2.5 py-2 font-black uppercase tracking-[0.18em] text-slate-700 tabular-nums">Totals</td>
                      <td className="border border-slate-300 px-2.5 py-2 tabular-nums" />
                      <td className="border border-slate-300 px-2.5 py-2 tabular-nums" />
                      <td className="border border-slate-300 px-2.5 py-2 text-right font-black text-slate-900 tabular-nums">{fmt(totals.totalOrdered)}</td>
                      <td className="border border-slate-300 px-2.5 py-2 text-right font-black text-slate-900 tabular-nums">{fmt(totals.verifiedPaid)}</td>
                      <td className="border border-slate-300 px-2.5 py-2 text-right font-black text-slate-900 tabular-nums">
                        {fmt(Math.abs(totals.currentBalance))}
                        <span className="text-[8px] text-slate-500 ml-1">
                          {totals.currentBalance < 0 ? '(Cr)' : '(Dr)'}
                        </span>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="bg-slate-900 px-6 py-6 flex flex-wrap border-t border-slate-800 items-baseline justify-between transition-all gap-8">
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Opening Balance</p>
              <p className="text-xl font-black text-white italic">{fmt(0)}</p>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden md:block" />
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Sales</p>
              <p className="text-xl font-black text-white italic">{fmt(totals.totalOrdered)}</p>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden md:block" />
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Receipts</p>
              <p className="text-xl font-black text-white italic">{fmt(totals.verifiedPaid)}</p>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden md:block" />
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Outstanding Amount</p>
              <p className="text-xl font-black text-white italic">{fmt(Math.max(0, totals.currentBalance))}</p>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden lg:block" />
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Customer Advance</p>
              <p className="text-3xl font-black text-white underline decoration-blue-500 decoration-double decoration-4 underline-offset-8 italic font-display">
                {fmt(totals.currentBalance < 0 ? Math.abs(totals.currentBalance) : 0)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 bg-amber-50 p-3 rounded-2xl border border-amber-100">
        <AlertCircle className="text-amber-500 shrink-0" size={18} />
        <p className="text-[10px] font-medium text-amber-900 leading-relaxed">
          <span className="font-black uppercase tracking-widest mr-2">Policy Note:</span>
          All sales entries strictly increase your outstanding debit. Receipt entries represent your successful payments verified by our accounts. If you find any discrepancies, please download the statement and contact the Billing Manager.
        </p>
      </div>
    </div>
  );
}

export function LedgerDetailView({
  targetUserId,
  backHref,
  backLabel,
  showBreadcrumb,
}: {
  targetUserId: string;
  backHref: string;
  backLabel?: string;
  showBreadcrumb?: boolean;
}) {
  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']}>
      <LedgerDetailBody targetUserId={targetUserId} backHref={backHref} backLabel={backLabel} showBreadcrumb={showBreadcrumb} />
    </RoleGuard>
  );
}

