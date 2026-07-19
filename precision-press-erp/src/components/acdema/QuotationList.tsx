'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, ArrowRight, CheckCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export function QuotationList({ quotations, title = 'Quotations', newActionHref }: any) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = quotations.filter((q: any) =>
    (q.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (q.quotation_number || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200/60">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 font-medium tracking-wide">Manage customer quotations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search quotations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 rounded-full border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-[13px] outline-none focus:border-slate-300 focus:bg-white transition-all font-medium text-slate-800 placeholder:text-slate-400"
            />
          </div>
          {newActionHref && (
            <Link
              href={newActionHref}
              className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-[11px] font-black uppercase tracking-widest text-white shadow-md shadow-slate-900/10 hover:bg-slate-800 hover:shadow-lg transition-all"
            >
              <Plus size={14} /> Add Quotation
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50/80 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-6 py-4 rounded-l-xl">Quotation No</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Order ID</th>
              <th className="px-6 py-4 text-right">Amount</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 rounded-r-xl">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length > 0 ? (
              filtered.map((q: any) => (
                <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4 font-bold text-slate-900 group relative">
                    <div className="flex items-center gap-2">
                      {q.quotation_number}
                      <Link 
                        href={`/documents/quotation/${q.id}/print`}
                        target="_blank"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-600"
                        title="View Quotation"
                      >
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{format(new Date(q.created_at), 'dd MMM yyyy, hh:mm a')}</td>
                  <td className="px-6 py-4 font-bold">{q.customerName}</td>
                  <td className="px-6 py-4 font-mono text-[10px] font-bold text-slate-500">
                    {q.parent_order_id ? q.parent_order_id : '—'}
                  </td>
                  <td className="px-6 py-4 text-right font-black text-slate-900">
                    Rs. {Number(q.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={
                      q.status === 'ACCEPTED' ? 'default' :
                      q.status === 'REJECTED' ? 'destructive' :
                      'outline'
                    } className="text-[10px] uppercase tracking-wider font-black">
                      {q.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {q.status === 'ACCEPTED' ? (
                      <Link 
                        href={`/proxy-order?quotationId=${q.id}`}
                        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full transition-all"
                      >
                        Continue to Order <ArrowRight size={12} />
                      </Link>
                    ) : q.status === 'ORDERED' ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                        <CheckCircle size={12} /> CONVERTED
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold text-slate-400">WAITING</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400 font-medium">
                  No quotations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
