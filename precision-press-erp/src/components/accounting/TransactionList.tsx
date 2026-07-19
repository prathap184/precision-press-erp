'use client';

import React, { useState, useMemo } from 'react';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Plus, FileText, ChevronLeft, ChevronRight, Settings, Download, AlertCircle, X } from 'lucide-react';
import Link from 'next/link';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {

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
          <button className="px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-slate-50 text-slate-700 bg-white shadow-sm">
            <Settings className="w-4 h-4" />
          </button>
          {newActionHref && newActionLabel && (
            <Link 
              href={newActionHref}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              {newActionLabel}
            </Link>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6">
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="bg-white p-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search ID, customer, ref ID..."
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
                <button 
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setSearchTerm('');
                  }}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 shrink-0 ml-2"
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
          </div>
          {/* Action Bar (shows when items selected) */}
          {selectedIds.size > 0 && (
            <div className="bg-blue-50/50 border-b px-4 py-2 flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">{selectedIds.size} selected</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 text-red-600 hover:bg-red-50 rounded font-medium transition-colors">Delete</button>
                <button className="px-3 py-1 text-slate-700 hover:bg-slate-100 rounded font-medium transition-colors">Actions</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/80 text-slate-500 font-medium border-b">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={transactions.length > 0 && selectedIds.size === transactions.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Entry ID</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Customer Name</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Status</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Category</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Posting Date</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors text-right">Amount</th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-100 transition-colors">Ref ID</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileText className="w-8 h-8 text-slate-300" />
                        <p>{emptyMessage}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(t => {
                    const isSelected = selectedIds.has(t.id);
                    const amount = t.type === 'SALE' ? t.debit : t.credit;
                    
                    return (
                      <tr 
                        key={t.id} 
                        className={`hover:bg-slate-50/80 transition-colors group ${isSelected ? 'bg-blue-50/30' : 'bg-white'}`}
                      >
                        <td className="px-4 py-3">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={isSelected}
                            onChange={() => toggleSelect(t.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {t.type === 'RECEIPT' ? (
                            <Link href={`/receipt-entry/${t.id}`} className="text-blue-600 hover:underline font-medium text-xs">
                              {t.receipt_entry_number || t.id}
                            </Link>
                          ) : t.type === 'PAYMENT' ? (
                            <Link href={`/payment-entry/${t.id}`} className="text-blue-600 hover:underline font-medium text-xs">
                              {t.receipt_entry_number || t.id}
                            </Link>
                          ) : t.type === 'SALE' && t.invoiceId ? (
                            <Link href={`/admin/invoices/${t.invoiceId}/print`} className="text-blue-600 hover:underline font-medium text-xs">
                              {t.sale_entry_number || t.id}
                            </Link>
                          ) : (
                            <span className="text-blue-600 font-medium text-xs">
                              {t.sale_entry_number || t.receipt_entry_number || t.id}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{t.customerName || 'Unknown Customer'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={t.status === 'Unpaid' ? 'destructive' : t.status === 'Overdue' ? 'destructive' : 'default'} className="font-normal rounded-full px-2.5 py-0">
                            {t.status || (t.isVerified ? 'Verified' : 'Draft')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{t.type}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {t.timestamp ? format(new Date(t.timestamp), 'dd-MM-yyyy') : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatCurrency(amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs font-mono">
                          {t.invoiceId && t.refId ? (
                            <Link href={`/admin/invoices/${t.invoiceId}/print`} className="text-blue-600 hover:underline">
                              {t.refId}
                            </Link>
                          ) : (
                            t.refId || '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {t.type === 'SALE' && t.invoiceId ? (
                            <Link href={`/admin/invoices/${t.invoiceId}/print`} className="inline-flex items-center justify-center group-hover:text-violet-500 text-slate-300 transition-colors">
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
          {transactions.length > 0 && (
            <div className="bg-slate-50 px-4 py-3 border-t flex items-center justify-between text-sm text-slate-600">
              <div>
                Showing 1 to {transactions.length} of {transactions.length} entries
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
    </div>
  );
}
