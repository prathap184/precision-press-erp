'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, FileText, Download, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);
};

interface LedgerEntry {
  id: string;
  timestamp: string;
  account: string;
  party: string;
  debit: number;
  credit: number;
  voucherType: string;
  paymentMode: string;
  bankLedger?: string;
  voucherNo: string;
  refId?: string;
  invoiceId?: string;
}

interface GeneralLedgerClientProps {
  entries: LedgerEntry[];
  title?: string;
  subtitle?: string;
  showSummary?: boolean;
  openingBalance?: number;
}

export function GeneralLedgerClient({ 
  entries, 
  title = 'General Ledger', 
  subtitle = 'Unified chronological view of all transactions.',
  showSummary = false,
  openingBalance = 0
}: GeneralLedgerClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  const VOUCHER_TYPES = ['All', 'SALE', 'RECEIPT', 'PAYMENT', 'JOURNAL', 'CONTRA', 'DEBIT', 'CREDIT'];

  const VOUCHER_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    SALE:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
    RECEIPT: { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500'    },
    PAYMENT: { bg: 'bg-rose-50',     text: 'text-rose-700',    dot: 'bg-rose-500'    },
    JOURNAL: { bg: 'bg-violet-50',   text: 'text-violet-700',  dot: 'bg-violet-500'  },
    CONTRA:  { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
    DEBIT:   { bg: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
    CREDIT:  { bg: 'bg-teal-50',     text: 'text-teal-700',    dot: 'bg-teal-500'    },
  };

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (typeFilter === 'DEBIT' && e.debit <= 0) return false;
      if (typeFilter === 'CREDIT' && e.credit <= 0) return false;
      if (typeFilter !== 'All' && typeFilter !== 'DEBIT' && typeFilter !== 'CREDIT' && e.voucherType !== typeFilter) return false;

      if (dateFrom || dateTo) {
        const d = parseISO(e.timestamp);
        if (dateFrom && d < startOfDay(parseISO(dateFrom))) return false;
        if (dateTo   && d > endOfDay(parseISO(dateTo)))     return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          e.party.toLowerCase().includes(q) ||
          e.voucherNo.toLowerCase().includes(q) ||
          e.account.toLowerCase().includes(q) ||
          e.voucherType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, typeFilter, dateFrom, dateTo, searchTerm]);

  const totalDebit = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = filteredEntries.reduce((sum, e) => sum + e.credit, 0);
  const totalBalance = openingBalance + totalCredit - totalDebit;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {showSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Total Debit (Out)</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDebit)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Total Credit (In)</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCredit)}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Calculated Balance</p>
            <p className={`text-2xl font-bold ${totalBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totalBalance)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters */}
        <div className="bg-white p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search voucher no, party, account..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
              />
              <span className="text-slate-400 text-xs font-medium">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
              />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Voucher Type Pills */}
          <div className="flex flex-wrap gap-2 mt-2">
            {VOUCHER_TYPES.map(t => {
              const active = typeFilter === t;
              const c = VOUCHER_COLORS[t];
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border transition-all ${
                    active
                      ? c ? `${c.bg} ${c.text} border-transparent` : 'bg-slate-800 text-white border-transparent'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/80 text-slate-500 font-medium border-b">
              <tr>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Posting Date</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Voucher Type</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Account</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Party</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors text-right">Debit (INR)</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors text-right">Credit (INR)</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Payment Mode</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Voucher No</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 text-slate-300" />
                      <p>No ledger entries found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e, idx) => {
                  return (
                    <tr 
                      key={`${e.id}-${idx}`} 
                      className="hover:bg-slate-50/80 transition-colors group bg-white"
                    >
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {e.timestamp ? format(new Date(e.timestamp), 'dd-MM-yyyy') : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${VOUCHER_COLORS[e.voucherType]?.bg || 'bg-slate-100'} ${VOUCHER_COLORS[e.voucherType]?.text || 'text-slate-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${VOUCHER_COLORS[e.voucherType]?.dot || 'bg-slate-400'}`} />
                          {e.voucherType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{e.account}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{e.party || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                        {e.debit > 0 ? formatCurrency(e.debit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                        {e.credit > 0 ? formatCurrency(e.credit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{e.paymentMode === '-' ? '' : e.paymentMode}</td>
                      <td className="px-4 py-3">
                        {e.voucherType === 'RECEIPT' ? (
                          <Link href={`/receipt-entry/${e.id}`} className="text-blue-600 hover:underline font-medium text-xs whitespace-nowrap flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span> {e.voucherNo}
                          </Link>
                        ) : e.voucherType === 'PAYMENT' ? (
                          <Link href={`/payment-entry/${e.id}`} className="text-blue-600 hover:underline font-medium text-xs whitespace-nowrap flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-500"></span> {e.voucherNo}
                          </Link>
                        ) : e.voucherType === 'SALE' && e.invoiceId ? (
                          <Link href={`/admin/invoices/${e.invoiceId}/print`} className="text-blue-600 hover:underline font-medium text-xs whitespace-nowrap flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {e.voucherNo}
                          </Link>
                        ) : e.voucherType === 'CONTRA' || e.voucherType === 'JOURNAL' ? (
                          <span className="text-slate-600 font-medium text-xs whitespace-nowrap flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span> {e.voucherNo}
                          </span>
                        ) : (
                          <span className="text-blue-600 font-medium text-xs whitespace-nowrap flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span> {e.voucherNo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.voucherType === 'SALE' && e.invoiceId ? (
                          <Link href={`/admin/invoices/${e.invoiceId}/print`} className="inline-flex items-center justify-center group-hover:text-violet-500 text-slate-300 transition-colors">
                            <ChevronRight size={18} />
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {filteredEntries.length > 0 && (
          <div className="bg-slate-50 px-4 py-3 border-t flex items-center justify-between text-sm text-slate-600">
            <div>
              Showing 1 to {filteredEntries.length} of {filteredEntries.length} entries
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1 hover:bg-slate-200 rounded text-slate-400 cursor-not-allowed">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button className="px-3 py-1 bg-white border border-slate-300 rounded font-medium shadow-sm">1</button>
              <button className="p-1 hover:bg-slate-200 rounded text-slate-400 cursor-not-allowed">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
