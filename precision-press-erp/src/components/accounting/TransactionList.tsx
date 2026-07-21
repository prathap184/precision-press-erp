'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { format, parseISO, startOfDay, endOfDay, subDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Plus, FileText, ChevronLeft, ChevronRight, Settings, Download, AlertCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useF2DateShortcut } from '@/hooks/useF2DateShortcut';
import { F2DatePicker } from '@/components/ui/F2DatePicker';

interface Transaction {
  id: string;
  userId: string;
  type: string;
  ledgerType: string;
  refId: string;
  debit: number;
  credit: number;
  balanceBefore: number;
  balanceAfter: number;
  availableCredit: number;
  remarks?: string;
  timestamp: string;
  isVerified: boolean;
  verifiedAt: string;
  verifiedBy: string;
  paymentMode: string;
  paymentId: string;
  sale_entry_number: string | null;
  receipt_entry_number: string | null;
  link?: string | null;
  customerName?: string;
  status?: string;
  invoiceId?: string;
}

interface TransactionListProps {
  title: string;
  transactions: Transaction[];
  emptyMessage: string;
  newActionHref?: string;
  newActionLabel?: string;
}

export function TransactionList({ title, transactions, emptyMessage, newActionHref, newActionLabel }: TransactionListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlFrom = searchParams.get('from');
  const urlTo = searchParams.get('to');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
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

  const { isOpen: f2Open, open: openF2, close: closeF2 } = useF2DateShortcut();

  const handleF2Apply = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    updateUrl(from, to);
    closeF2();
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Date filtering now largely handled by server, 
      // but we still apply local filtering just in case server sends extra or user hasn't hit apply yet
      if (dateFrom || dateTo) {
        const d = parseISO(t.timestamp);
        if (dateFrom && d < startOfDay(parseISO(dateFrom))) return false;
        if (dateTo   && d > endOfDay(parseISO(dateTo)))     return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          (t.customerName?.toLowerCase() || '').includes(q) ||
          (t.id?.toLowerCase() || '').includes(q) ||
          (t.refId?.toLowerCase() || '').includes(q) ||
          (t.sale_entry_number?.toLowerCase() || '').includes(q) ||
          (t.receipt_entry_number?.toLowerCase() || '').includes(q) ||
          t.type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, dateFrom, dateTo, searchTerm]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === transactions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(transactions.map(t => t.id)));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      {/* F2 Date Picker Popup */}
      {f2Open && (
        <F2DatePicker
          currentFrom={dateFrom}
          currentTo={dateTo}
          onApply={handleF2Apply}
          onClose={closeF2}
        />
      )}

      {/* Header bar matching ERPNext */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-slate-50 text-slate-700 bg-white shadow-sm">
            <Download className="w-4 h-4" />
            Export
          </button>
          
          {newActionHref && newActionLabel && (
            <Link 
              href={newActionHref}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              {newActionLabel}
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        <div className="bg-white rounded-lg border shadow-sm flex flex-col h-full">
          
          {/* List View Controls */}
          <div className="border-b px-4 py-3 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
            
            {/* Left controls - Search and filters */}
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="ID, Customer, Type..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                />
              </div>

              {/* Date Filters */}
              <div className="flex items-center gap-2">
                <button
                  onClick={openF2}
                  title="Press F2 to change date period"
                  className="text-[10px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-300 px-2 py-1 rounded-md hover:bg-indigo-100 transition-colors cursor-pointer select-none"
                >
                  F2 · {format(new Date(dateFrom || new Date()), 'dd MMM')} → {format(new Date(dateTo || new Date()), 'dd MMM yyyy')}
                </button>
              </div>

              {/* Quick Date Filters */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    setDateFrom(today);
                    setDateTo(today);
                    updateUrl(today, today);
                  }}
                  className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 rounded transition-colors"
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
                  className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 rounded transition-colors"
                >
                  Yesterday
                </button>
                <button
                  onClick={() => {
                    updateUrl('', '');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 rounded transition-colors"
                >
                  All Time
                </button>
              </div>

            </div>

            {/* Right controls - Settings */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">
                {filteredTransactions.length} records
              </span>
              <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-sm text-slate-500 bg-slate-50/50">
                  <th className="p-3 w-10 text-center font-medium">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedIds.size === transactions.length && transactions.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="p-3 font-medium cursor-pointer hover:bg-slate-100 select-none">
                    Voucher No.
                  </th>
                  <th className="p-3 font-medium cursor-pointer hover:bg-slate-100 select-none w-32">
                    Date
                  </th>
                  <th className="p-3 font-medium cursor-pointer hover:bg-slate-100 select-none">
                    Party / Customer
                  </th>
                  <th className="p-3 font-medium cursor-pointer hover:bg-slate-100 select-none">
                    Type
                  </th>
                  <th className="p-3 font-medium cursor-pointer hover:bg-slate-100 select-none text-right">
                    Amount
                  </th>
                  <th className="p-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <AlertCircle className="w-8 h-8 text-slate-300" />
                        <p>{emptyMessage}</p>
                        {newActionHref && newActionLabel && (
                          <Link 
                            href={newActionHref}
                            className="mt-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md font-medium transition-colors"
                          >
                            {newActionLabel}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(t => {
                    const isSelected = selectedIds.has(t.id);
                    const amount = t.debit > 0 ? t.debit : t.credit;
                    
                    return (
                      <tr 
                        key={t.id} 
                        className={`hover:bg-slate-50/80 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}
                      >
                        <td className="p-3 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelect(t.id)}
                          />
                        </td>
                        <td className="p-3">
                          <Link 
                            href={t.invoiceId ? `/admin/invoices/${t.invoiceId}/print` : '#'} 
                            className="font-medium text-slate-900 hover:text-indigo-600 hover:underline flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                            {t.sale_entry_number || t.receipt_entry_number || t.refId || t.id.split('-')[0]}
                          </Link>
                        </td>
                        <td className="p-3 text-slate-600">
                          {format(parseISO(t.timestamp), 'dd MMM yyyy')}
                        </td>
                        <td className="p-3 text-slate-800 font-medium truncate max-w-[200px]" title={t.customerName}>
                          {t.customerName || '-'}
                        </td>
                        <td className="p-3">
                          <span className="text-xs font-medium uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded">
                            {t.type}
                          </span>
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-700">
                          {formatCurrency(amount)}
                        </td>
                        <td className="p-3 text-center">
                          {t.status ? (
                            <Badge variant={
                              t.status === 'Paid' || t.status === 'Verified' ? 'success' : 
                              t.status === 'Partially Paid' ? 'warning' : 'secondary'
                            } className="font-normal rounded-full px-2.5">
                              {t.status}
                            </Badge>
                          ) : (
                            <Badge variant={t.isVerified ? 'success' : 'secondary'} className="font-normal rounded-full px-2.5">
                              {t.isVerified ? 'Verified' : 'Draft'}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Pagination */}
          <div className="border-t px-4 py-3 bg-white flex items-center justify-between text-sm text-slate-500 rounded-b-lg">
            <div>
              {filteredTransactions.length} item{filteredTransactions.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded transition-colors disabled:opacity-50">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="px-3 py-1 bg-slate-100 rounded text-slate-700 font-medium">1</div>
              <button className="p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded transition-colors disabled:opacity-50">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
