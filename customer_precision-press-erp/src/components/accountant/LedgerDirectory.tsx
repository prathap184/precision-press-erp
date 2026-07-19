'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCustomerLedgerSummaries, CustomerSummary } from '@/lib/actions/accounts';
import { RoleGuard } from '@/lib/role-guard';
import { Search, Loader2, ChevronRight, FileText, Filter } from 'lucide-react';
import { toast } from 'sonner';

const fmtDate = (v: any) => {
  if (!v) return '—';
  const d = v?.seconds ? new Date(v.seconds * 1000) : new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function LedgerDirectory() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'CREDIT'>('ALL');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const uid = searchParams.get('uid');
    if (uid) {
      router.replace(`/accountant/ledger/${uid}`);
      return;
    }

    const presetSearch = searchParams.get('search');
    if (presetSearch) setSearchTerm(presetSearch);

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getCustomerLedgerSummaries();
      setCustomers(data);
    } catch (error) {
      toast.error('Failed to load customer ledgers');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        c.uid.toLowerCase().includes(q);

      const isPending = (c.calculatedBalance || 0) > 0;
      const isVerified = (c.calculatedBalance || 0) <= 0;
      const isCredit = c.customerType === 'CREDIT';

      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'PENDING' && isPending) ||
        (filter === 'VERIFIED' && isVerified) ||
        (filter === 'CREDIT' && isCredit);

      return matchesSearch && matchesFilter;
    });
  }, [customers, searchTerm, filter]);

  return (
    <RoleGuard allowedRoles={['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-3 pb-4 animate-in fade-in duration-500">
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase">LN</span>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-slate-500">Accounts Ledger</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="bg-slate-900 text-white h-11 px-3 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm hover:bg-slate-800 transition-all"
          >
            <Loader2 size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </section>

        <section className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-3 py-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
            <div className="relative lg:max-w-lg w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                type="text"
                placeholder="Search by name, phone, or ID"
                className="bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-3 py-2 text-[10px] font-semibold text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10 transition-all w-full"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(['ALL', 'PENDING', 'VERIFIED', 'CREDIT'] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[8px] font-black uppercase tracking-[0.18em] transition-all ${filter === item ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Filter size={12} /> {item}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-3xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  <th className="border border-slate-200 px-3 py-2.5">Customer</th>
                  <th className="border border-slate-200 px-3 py-2.5">ID</th>
                  <th className="border border-slate-200 px-3 py-2.5">Phone</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-right">Total</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-right">Paid</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-right">Pending</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-right">Last</th>
                  <th className="border border-slate-200 px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="text-[10px] font-semibold text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center tabular-nums">
                      <Loader2 className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-3" />
                      <p className="text-slate-500 uppercase tracking-[0.2em] text-[10px]">Loading ledger...</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center tabular-nums">
                      <FileText size={30} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 text-[11px]">No customers match your search.</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((c, index) => {
                    const pending = Math.max(0, c.calculatedBalance || 0);
                    return (
                      <tr
                        key={c.uid}
                        className={`border-b border-slate-200 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100 cursor-pointer`}
                        onClick={() => router.push(`/accountant/ledger/${c.uid}`)}
                      >
                        <td className="border border-slate-200 px-3 py-2.5 whitespace-nowrap tabular-nums">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-black text-blue-600 uppercase text-[11px]">
                              {c.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-black text-slate-900">{c.name}</p>
                              <p className="text-[8px] uppercase tracking-[0.18em] text-slate-500">{c.customerType}</p>
                            </div>
                          </div>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-slate-600 truncate max-w-[140px] tabular-nums">{c.uid}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-slate-600 tabular-nums">{c.phone || '—'}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-900 tabular-nums">₹{(c.totalSpend || 0).toLocaleString('en-IN')}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-right text-emerald-600 tabular-nums">₹{(c.totalPayments || 0).toLocaleString('en-IN')}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-right text-amber-600 tabular-nums">₹{pending.toLocaleString('en-IN')}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-600 tabular-nums">{fmtDate(c.lastOrderAt)}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center tabular-nums">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/accountant/ledger/${c.uid}`);
                            }}
                            className="inline-flex items-center justify-center rounded-xl bg-slate-900 text-white px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.25em] hover:bg-slate-800 transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </RoleGuard>
  );
}
