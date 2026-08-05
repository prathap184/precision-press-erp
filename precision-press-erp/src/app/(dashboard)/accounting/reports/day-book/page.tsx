'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Calendar, ChevronLeft, ChevronRight, Download, Printer, ArrowUpRight, Filter, Eye, RefreshCw
} from 'lucide-react';

export default function DayBookPage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [voucherFilter, setVoucherFilter] = useState<string>('ALL');
  const [themeMode, setThemeMode] = useState<'tally-classic' | 'tally-dark'>('tally-classic');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);

  const fetchDayBook = async (date: string) => {
    setLoading(true);
    try {
      const orgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
      const headers: Record<string, string> = {};
      if (orgId) headers['x-organization-id'] = orgId;

      const res = await fetch(`/api/v1/reports/day-book?date=${date}`, { headers });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load Day Book data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDayBook(selectedDate);
  }, [selectedDate]);

  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const filteredRecords = (data?.records || []).filter((r: any) => {
    if (voucherFilter === 'ALL') return true;
    if (voucherFilter === 'INVOICE') return r.voucherType === 'Sales Invoice';
    if (voucherFilter === 'RECEIPT') return r.voucherType === 'Receipt';
    if (voucherFilter === 'PAYMENT') return r.voucherType === 'Payment';
    if (voucherFilter === 'PURCHASE') return r.voucherType === 'Purchase';
    if (voucherFilter === 'STOCK_JOURNAL') return r.voucherType === 'Stock Journal';
    if (voucherFilter === 'CREDIT_NOTE') return r.voucherType === 'Credit Note';
    if (voucherFilter === 'DEBIT_NOTE') return r.voucherType === 'Debit Note';
    if (voucherFilter === 'JOURNAL') return r.voucherType === 'Journal';
    return true;
  });

  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(selectedDate + 'T00:00:00Z'));

  const isClassic = themeMode === 'tally-classic';

  return (
    <div className={`min-h-screen p-4 font-mono transition-colors duration-200 ${
      isClassic 
        ? 'bg-[#f4ebd0] text-[#1a231b]' 
        : 'bg-[#0f172a] text-slate-100'
    }`}>
      {/* Tally ERP Header Bar */}
      <div className={`border-2 rounded-t-lg shadow-md overflow-hidden ${
        isClassic ? 'border-[#1b4332] bg-[#1b4332] text-white' : 'border-slate-700 bg-slate-900 text-slate-100'
      }`}>
        <div className="px-4 py-2 flex items-center justify-between font-bold text-sm tracking-wider uppercase border-b border-emerald-700/50">
          <div className="flex items-center gap-3">
            <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-xs font-black">TALLY ERP 9</span>
            <span>Day Book</span>
          </div>
          <div className="text-center font-black tracking-widest text-emerald-200">
            DEMO COMPANY
          </div>
          <div className="text-xs font-normal text-emerald-200">
            {formattedDate}
          </div>
        </div>

        {/* Date Selector Toolbar */}
        <div className={`px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t ${
          isClassic ? 'bg-[#2d6a4f] text-emerald-100 border-emerald-600' : 'bg-slate-800 text-slate-300 border-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevDay}
              className="px-2 py-1 bg-black/20 hover:bg-black/40 rounded border border-white/20 font-bold flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Prev Day
            </button>
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded border border-white/20">
              <Calendar size={14} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent font-bold outline-none cursor-pointer text-white"
              />
            </div>
            <button
              onClick={handleNextDay}
              className="px-2 py-1 bg-black/20 hover:bg-black/40 rounded border border-white/20 font-bold flex items-center gap-1"
            >
              Next Day <ChevronRight size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setThemeMode(isClassic ? 'tally-dark' : 'tally-classic')}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded shadow transition-colors"
            >
              {isClassic ? '🌙 Dark Tally Theme' : '📜 Classic Tally Theme'}
            </button>
            <button
              onClick={() => fetchDayBook(selectedDate)}
              className="p-1.5 bg-black/20 hover:bg-black/40 rounded border border-white/20"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={`flex items-center gap-1 overflow-x-auto p-2 border-x-2 text-xs font-bold ${
        isClassic ? 'bg-[#e9d8a6] border-[#1b4332] text-slate-900' : 'bg-slate-900/90 border-slate-700 text-slate-300'
      }`}>
        <span className="text-[10px] uppercase tracking-wider mr-2 text-slate-600">Filter Vouchers:</span>
        {[
          { id: 'ALL', label: 'All Vouchers' },
          { id: 'INVOICE', label: 'Sales Invoices' },
          { id: 'RECEIPT', label: 'Receipts' },
          { id: 'PAYMENT', label: 'Payments' },
          { id: 'PURCHASE', label: 'Purchases' },
          { id: 'STOCK_JOURNAL', label: 'Stock Journals' },
          { id: 'CREDIT_NOTE', label: 'Credit Notes' },
          { id: 'DEBIT_NOTE', label: 'Debit Notes' },
          { id: 'JOURNAL', label: 'Journals' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setVoucherFilter(tab.id)}
            className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap ${
              voucherFilter === tab.id
                ? (isClassic ? 'bg-[#1b4332] text-white border-[#1b4332]' : 'bg-indigo-600 text-white border-indigo-500')
                : (isClassic ? 'bg-[#f4ebd0] text-[#1a231b] border-[#bb9457] hover:bg-[#e0c9a6]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white')
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Tally Day Book Table */}
      <div className={`border-2 border-t-0 rounded-b-lg shadow-xl overflow-hidden ${
        isClassic ? 'border-[#1b4332] bg-[#fdfaf1]' : 'border-slate-700 bg-slate-900'
      }`}>
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className={`border-b-2 font-bold uppercase tracking-wider ${
              isClassic ? 'bg-[#d8c3a5] text-[#1b4332] border-[#1b4332]' : 'bg-slate-800 text-slate-200 border-slate-700'
            }`}>
              <th className="px-4 py-2.5 w-28 border-r border-slate-400/30">Date</th>
              <th className="px-4 py-2.5 border-r border-slate-400/30">Particulars</th>
              <th className="px-4 py-2.5 w-36 border-r border-slate-400/30">Vch Type</th>
              <th className="px-4 py-2.5 w-24 text-center border-r border-slate-400/30">Vch No.</th>
              <th className="px-4 py-2.5 w-36 text-right border-r border-slate-400/30">Debit Amount (₹)</th>
              <th className="px-4 py-2.5 w-36 text-right">Credit Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-400/20">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">
                  <RefreshCw size={24} className="animate-spin inline mb-2" />
                  <p>Loading Tally Day Book Vouchers...</p>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">
                  No vouchers recorded on {formattedDate}.
                </td>
              </tr>
            ) : (
              filteredRecords.map((record: any, idx: number) => {
                const isHoverClassic = 'hover:bg-[#e9d8a6] hover:text-[#1b4332]';
                const isHoverDark = 'hover:bg-slate-800/80';

                return (
                  <React.Fragment key={`${record.id}-${idx}`}>
                    <tr className={`transition-colors cursor-pointer ${
                      isClassic ? isHoverClassic : isHoverDark
                    } ${record.isVoid ? 'opacity-40 italic' : ''}`}>
                      <td className="px-4 py-2 font-semibold border-r border-slate-400/20 whitespace-nowrap">
                        {record.date}
                      </td>
                      <td className="px-4 py-2 font-bold border-r border-slate-400/20">
                        <div className="flex items-center justify-between">
                          <span>{record.partyName}</span>
                          {record.link && (
                            <Link 
                              href={record.link}
                              className="text-[10px] underline font-normal opacity-60 hover:opacity-100"
                            >
                              Open
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 border-r border-slate-400/20 font-semibold whitespace-nowrap">
                        {record.voucherType}
                      </td>
                      <td className="px-4 py-2 text-center border-r border-slate-400/20 font-bold whitespace-nowrap">
                        {record.voucherNo}
                      </td>
                      <td className="px-4 py-2 text-right border-r border-slate-400/20 font-bold font-mono text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {record.debitAmount > 0 ? record.debitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}
                      </td>
                      <td className="px-4 py-2 text-right font-bold font-mono text-rose-700 dark:text-rose-400 whitespace-nowrap">
                        {record.creditAmount > 0 ? record.creditAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}
                      </td>
                    </tr>

                    {/* Detailed Ledger Breakdown inside Tally row */}
                    {record.items && record.items.length > 0 && (
                      <tr className={isClassic ? 'bg-[#f4ebd0]/60' : 'bg-slate-900/60'}>
                        <td colSpan={6} className="px-8 py-2 text-[11px] border-b border-slate-400/20">
                          <div className="pl-4 border-l-2 border-emerald-600/50 space-y-1">
                            {record.items.map((it: any, i: number) => (
                              <div key={i} className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                                <span>
                                  {it.accountCode && <strong className="mr-2 text-emerald-800 dark:text-emerald-400">{it.accountCode}</strong>}
                                  {it.accountName || it.description}
                                </span>
                                <div className="space-x-4 font-mono font-bold">
                                  {it.debit > 0 && <span className="text-emerald-700 dark:text-emerald-400">Dr ₹{it.debit.toFixed(2)}</span>}
                                  {it.credit > 0 && <span className="text-rose-700 dark:text-rose-400">Cr ₹{it.credit.toFixed(2)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {/* Table Footer Totals */}
          {filteredRecords.length > 0 && (
            <tfoot>
              <tr className={`border-t-2 font-bold uppercase ${
                isClassic ? 'bg-[#d8c3a5] text-[#1b4332] border-[#1b4332]' : 'bg-slate-800 text-slate-100 border-slate-700'
              }`}>
                <td colSpan={4} className="px-4 py-2.5 text-right font-black border-r border-slate-400/30">
                  Total Daily Debits & Credits:
                </td>
                <td className="px-4 py-2.5 text-right font-black font-mono border-r border-slate-400/30 text-emerald-800 dark:text-emerald-400">
                  ₹{(data?.summary?.totalDebits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2.5 text-right font-black font-mono text-rose-800 dark:text-rose-400">
                  ₹{(data?.summary?.totalCredits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
