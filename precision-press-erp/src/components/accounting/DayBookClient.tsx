'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { format, subDays } from 'date-fns';
import { Search, X, BookOpen } from 'lucide-react';
import { TallyLedgerTemplate, TallyRow } from './TallyLedgerTemplate';

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
  serverOpeningBalance: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Component ────────────────────────────────────────────────────────────────
export function DayBookClient({ rows, serverOpeningBalance }: DayBookClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlFrom = searchParams.get('from');
  const urlTo = searchParams.get('to');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  
  // Local state for the inputs before they are submitted to the URL
  const [dateFrom, setDateFrom] = useState(urlFrom === 'all' ? '' : (urlFrom || format(new Date(), 'yyyy-MM-dd')));
  const [dateTo, setDateTo] = useState(urlTo === 'all' ? '' : (urlTo || format(new Date(), 'yyyy-MM-dd')));

  // On mount, if no URL params exist, set them to today so server gets them
  useEffect(() => {
    if (!urlFrom || !urlTo) {
      updateUrl(format(new Date(), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd'));
    }
  }, []);

  const updateUrl = (from: string, to: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set('from', from);
    else params.set('from', 'all');
    
    if (to) params.set('to', to);
    else params.set('to', 'all');

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDateChange = () => {
    updateUrl(dateFrom, dateTo);
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (typeFilter !== 'All' && r.voucherType !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          r.voucherNo.toLowerCase().includes(s) ||
          r.party.toLowerCase().includes(s) ||
          String(r.amount).includes(s)
        );
      }
      return true;
    });
  }, [rows, typeFilter, search]);

  // Map to TallyRow
  const tallyRows: TallyRow[] = filtered.map(r => ({
    id: r.id,
    date: r.date,
    particulars: r.party || '-',
    vchType: r.voucherType,
    vchNo: r.voucherNo,
    debit: r.debit,
    credit: r.credit
  }));

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
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* ── Filters ── */}
        <div className="bg-white p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search voucher no, party, amount…"
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={e => {
                  setDateFrom(e.target.value);
                }}
                onBlur={handleDateChange}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
              />
              <span className="text-slate-400 text-xs font-medium">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => {
                  setDateTo(e.target.value);
                }}
                onBlur={handleDateChange}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
              />
              <button 
                onClick={handleDateChange}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Apply
              </button>
            </div>

            {/* Quick Date Filters */}
            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={() => {
                  const today = format(new Date(), 'yyyy-MM-dd');
                  setDateFrom(today);
                  setDateTo(today);
                  updateUrl(today, today);
                }}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => {
                  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
                  setDateFrom(yesterday);
                  setDateTo(yesterday);
                  updateUrl(yesterday, yesterday);
                }}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              >
                Yesterday
              </button>
              <button
                onClick={() => {
                  const twoDaysAgo = format(subDays(new Date(), 2), 'yyyy-MM-dd');
                  setDateFrom(twoDaysAgo);
                  setDateTo(twoDaysAgo);
                  updateUrl(twoDaysAgo, twoDaysAgo);
                }}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              >
                2 Days Ago
              </button>
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

        {/* Tally Template */}
        <TallyLedgerTemplate
          title="Day Book"
          dateFrom={urlFrom || dateFrom}
          dateTo={urlTo || dateTo}
          openingBalance={serverOpeningBalance}
          rows={tallyRows}
        />

      </div>
    </div>
  );
}
