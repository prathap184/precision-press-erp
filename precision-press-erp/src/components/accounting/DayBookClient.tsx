'use client';

import React, { useState, useMemo } from 'react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Search, Filter, X, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DayBookRow {
  id: string;
  date: string;
  voucherType: string;
  voucherNo: string;
  party: string;
  paymentMode: string | null;
  amount: number;
  debit: number;
  credit: number;
  status: string;
  refId?: string;
  invoiceId?: string;
}

interface DayBookClientProps {
  rows: DayBookRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

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

function VoucherBadge({ type }: { type: string }) {
  const c = VOUCHER_COLORS[type] ?? { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {type}
    </span>
  );
}

const PAGE_SIZE = 25;

// ─── Component ────────────────────────────────────────────────────────────────
export function DayBookClient({ rows }: DayBookClientProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      // Type filter
      if (typeFilter === 'DEBIT' && r.debit <= 0) return false;
      if (typeFilter === 'CREDIT' && r.credit <= 0) return false;
      if (typeFilter !== 'All' && typeFilter !== 'DEBIT' && typeFilter !== 'CREDIT' && r.voucherType !== typeFilter) return false;

      // Date range filter
      if (dateFrom || dateTo) {
        const d = parseISO(r.date);
        if (dateFrom && d < startOfDay(parseISO(dateFrom))) return false;
        if (dateTo   && d > endOfDay(parseISO(dateTo)))     return false;
      }

      // Text search
      if (search) {
        const q = search.toLowerCase();
        return (
          r.voucherNo.toLowerCase().includes(q) ||
          r.party.toLowerCase().includes(q) ||
          r.voucherType.toLowerCase().includes(q) ||
          String(r.amount).includes(q)
        );
      }

      return true;
    });
  }, [rows, typeFilter, dateFrom, dateTo, search]);

  // ── Summaries (on current filter) ────────────────────────────────────────
  const totalDebit  = filtered.reduce((s, r) => s + r.debit,  0);
  const totalCredit = filtered.reduce((s, r) => s + r.credit, 0);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetPage = () => setPage(1);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="text-indigo-500" size={20} />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Day Book</h1>
          </div>
          <p className="text-sm text-slate-500">Chronological view of every voucher — just like Tally.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
          <span className="bg-slate-100 px-3 py-1 rounded-full">{filtered.length} voucher{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Vouchers</p>
          <p className="text-2xl font-bold text-slate-800">{filtered.length}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 shadow-sm p-5">
          <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Credit (In)</p>
          <p className="text-2xl font-bold text-emerald-700">{fmt(totalCredit)}</p>
        </div>
        <div className="bg-rose-50 rounded-xl border border-rose-100 shadow-sm p-5">
          <p className="text-[11px] font-bold text-rose-500 uppercase tracking-widest mb-1">Total Debit (Out)</p>
          <p className="text-2xl font-bold text-rose-700">{fmt(totalDebit)}</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search voucher no, party, amount…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
            />
            {search && (
              <button onClick={() => { setSearch(''); resetPage(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); resetPage(); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
            />
            <span className="text-slate-400 text-xs font-medium">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); resetPage(); }}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
            />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); resetPage(); }} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Voucher Type Pills */}
        <div className="flex flex-wrap gap-2">
          {VOUCHER_TYPES.map(t => {
            const active = typeFilter === t;
            const c = VOUCHER_COLORS[t];
            return (
              <button
                key={t}
                onClick={() => { setTypeFilter(t); resetPage(); }}
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

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Posting Date</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Voucher Type</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Voucher No</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Party</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payment Mode</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Debit (₹)</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Credit (₹)</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Amount</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                    <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No vouchers found</p>
                    <p className="text-xs mt-1">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : pageRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                  {/* Date */}
                  <td className="px-4 py-3 text-slate-600 text-xs font-medium">
                    {format(parseISO(row.date), 'dd-MMM-yyyy')}
                  </td>

                  {/* Voucher Type */}
                  <td className="px-4 py-3">
                    <VoucherBadge type={row.voucherType} />
                  </td>

                  {/* Voucher No */}
                  <td className="px-4 py-3">
                    <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${
                      VOUCHER_COLORS[row.voucherType]
                        ? `${VOUCHER_COLORS[row.voucherType].bg} ${VOUCHER_COLORS[row.voucherType].text}`
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.voucherNo}
                    </span>
                  </td>

                  {/* Party */}
                  <td className="px-4 py-3 text-slate-700 font-medium max-w-[180px] truncate">
                    {row.party || <span className="text-slate-300">—</span>}
                  </td>

                  {/* Payment Mode */}
                  <td className="px-4 py-3">
                    {row.paymentMode && row.paymentMode !== '-' && (row.voucherType === 'RECEIPT' || row.voucherType === 'PAYMENT') ? (
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {row.paymentMode}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  {/* Debit */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.debit > 0
                      ? <span className="text-rose-600 font-semibold">{fmt(row.debit)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>

                  {/* Credit */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.credit > 0
                      ? <span className="text-emerald-600 font-semibold">{fmt(row.credit)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">
                    {fmt(row.amount)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <p className="text-xs text-slate-500 font-medium">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(safePage - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      pg === safePage
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
