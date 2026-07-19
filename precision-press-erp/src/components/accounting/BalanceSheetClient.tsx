'use client';

import React, { useState, useMemo } from 'react';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Building2, Wallet, Landmark, TrendingUp, Search, X } from 'lucide-react';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon size={22} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className={`text-3xl font-black tabular-nums leading-none ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 font-medium mt-2">{sub}</p>}
      </div>
    </div>
  );
}

interface BalanceSheetClientProps {
  allEntries: any[];
  totalOpeningBalance: number;
}

export function BalanceSheetClient({ allEntries, totalOpeningBalance }: BalanceSheetClientProps) {
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
    return allEntries.filter(e => {
      if (typeFilter === 'DEBIT' && e.debit <= 0) return false;
      if (typeFilter === 'CREDIT' && e.credit <= 0) return false;
      if (typeFilter !== 'All' && typeFilter !== 'DEBIT' && typeFilter !== 'CREDIT' && e.voucherType !== typeFilter) return false;

      if (dateFrom || dateTo) {
        const d = parseISO(e.timestamp);
        if (dateFrom && d < startOfDay(parseISO(dateFrom))) return false;
        if (dateTo   && d > endOfDay(parseISO(dateTo)))     return false;
      }
      return true;
    });
  }, [allEntries, dateFrom, dateTo, typeFilter]);

  let cashReceipts = 0;
  let cashPayments = 0;
  let bankReceipts = 0;
  let bankPayments = 0;

  for (const entry of filteredEntries) {
    if (entry.paymentMode === 'CASH') {
      cashReceipts += entry.credit; // IN
      cashPayments += entry.debit;  // OUT
    } else {
      bankReceipts += entry.credit; // IN
      bankPayments += entry.debit;  // OUT
    }
  }

  const totalReceipts = cashReceipts + bankReceipts;
  const totalPayments = cashPayments + bankPayments;

  const totalBalance = totalOpeningBalance + totalReceipts - totalPayments;
  const cashBalance = cashReceipts - cashPayments;
  const bankBalance = bankReceipts - bankPayments;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 font-sans selection:bg-blue-100 selection:text-blue-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <Building2 size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800 leading-tight">Balance Sheet</h1>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Financial Overview</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 mt-8 space-y-6">
        {/* Filters */}
        <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 ml-1">Date Range:</span>
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
            {(dateFrom || dateTo || typeFilter !== 'All') && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setTypeFilter('All'); }} className="text-slate-400 hover:text-slate-600 ml-1">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto custom-scrollbar">
            {VOUCHER_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all border ${
                  typeFilter === type
                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SummaryCard
              icon={TrendingUp}
              label="Total Balance"
              value={formatCurrency(totalBalance)}
              sub="Opening Balance + Total Receipts - Total Payments"
              color={totalBalance >= 0 ? "text-emerald-600" : "text-red-600"}
              bg={totalBalance >= 0 ? "bg-emerald-50" : "bg-red-50"}
            />
            
            <SummaryCard
              icon={Wallet}
              label="Total Cash Amount"
              value={formatCurrency(cashBalance)}
              sub="Cash Receipts - Cash Payments"
              color={cashBalance >= 0 ? "text-emerald-500" : "text-red-500"}
              bg={cashBalance >= 0 ? "bg-emerald-50" : "bg-red-50"}
            />
            
            <SummaryCard
              icon={Landmark}
              label="Total Bank Amount"
              value={formatCurrency(bankBalance)}
              sub="Bank Receipts - Bank Payments"
              color={bankBalance >= 0 ? "text-blue-600" : "text-red-600"}
              bg={bankBalance >= 0 ? "bg-blue-50" : "bg-red-50"}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">Detailed Breakdown</h2>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 font-semibold text-slate-600 text-[11px] uppercase tracking-wider">Metric</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 text-[11px] uppercase tracking-wider text-right">Cash Amount</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 text-[11px] uppercase tracking-wider text-right">Bank Amount</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 text-[11px] uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700">Opening Balance</td>
                    <td className="px-6 py-4 text-right tabular-nums text-slate-500">-</td>
                    <td className="px-6 py-4 text-right tabular-nums text-slate-500">-</td>
                    <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(totalOpeningBalance)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700">Total Receipts (+)</td>
                    <td className="px-6 py-4 text-right tabular-nums text-emerald-600 font-medium">{formatCurrency(cashReceipts)}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-emerald-600 font-medium">{formatCurrency(bankReceipts)}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-emerald-600 font-semibold">{formatCurrency(totalReceipts)}</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-700">Total Payments (-)</td>
                    <td className="px-6 py-4 text-right tabular-nums text-red-600 font-medium">{formatCurrency(cashPayments)}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-red-600 font-medium">{formatCurrency(bankPayments)}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-red-600 font-semibold">{formatCurrency(totalPayments)}</td>
                  </tr>
                  <tr className="bg-slate-50/80">
                    <td className="px-6 py-4 font-bold text-slate-800 text-[11px] uppercase tracking-widest">Calculated Balance</td>
                    <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-800 border-t border-slate-200 border-dashed">{formatCurrency(cashBalance)}</td>
                    <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-800 border-t border-slate-200 border-dashed">{formatCurrency(bankBalance)}</td>
                    <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-800 border-t border-slate-200 border-dashed">{formatCurrency(totalBalance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
        
        <p className="text-center text-[11px] text-slate-300 font-medium mt-12 pb-12">
          Data sourced from Supabase • Refreshed on every page load
        </p>
      </div>
    </div>
  );
}
