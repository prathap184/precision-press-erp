'use client';


import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { supabase } from '@/lib/supabase';
import { RoleGuard } from '@/lib/role-guard';
import {
  FileText, Download, Loader2, Search, Printer
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  Generated: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  GENERATED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Queued:    'bg-amber-50 text-amber-700 border-amber-200',
  QUEUED:    'bg-amber-50 text-amber-700 border-amber-200',
  Generating:'bg-blue-50 text-blue-700 border-blue-200',
  GENERATING:'bg-blue-50 text-blue-700 border-blue-200',
  Draft:     'bg-slate-50 text-slate-500 border-slate-200',
  DRAFT:     'bg-slate-50 text-slate-500 border-slate-200',
  Cancelled: 'bg-red-50 text-red-600 border-red-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
  Regenerated: 'bg-purple-50 text-purple-700 border-purple-200',
  REGENERATED: 'bg-purple-50 text-purple-700 border-purple-200',
  Paid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAID:      'bg-emerald-50 text-emerald-700 border-emerald-200',
};


export default function CustomerDocumentsPage() {
  const { profile } = useAuth();
  const { effectiveUserId } = useEffectiveUser(profile?.uid);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!effectiveUserId) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/invoices?customerId=${effectiveUserId}`);
        const data = await res.json();
        console.log('Fetched invoices from API:', data);
        setInvoices(data || []);
      } catch (e) {
        console.error('Failed to load invoices:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [effectiveUserId]);

  const fmtDate = (v: any) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  };

  const filtered = invoices.filter(inv => {
    if (!search) return true;
    const s = search.toLowerCase();
    const invNum = inv.invoiceNumber || inv.invoice_number || inv.id || '';
    const parentId = inv.parentOrderId || inv.parent_order_id || '';
    return invNum.toLowerCase().includes(s) || parentId.toLowerCase().includes(s);
  });

  const handlePrint = (invoiceId: string) => {
    window.open(`/dashboard/documents/invoice/${invoiceId}/print`, '_blank');
  };


  return (
    <RoleGuard allowedRoles={['CUSTOMER']}>
      <div className="space-y-4 pb-10">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-wider">My Documents</h1>
              <p className="text-[10px] text-slate-500 font-medium">GST Tax Invoices</p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">GST Tax Invoices</span>
              </div>
              <p className="text-xl font-black mt-1 text-indigo-600">{invoices.length}</p>
            </div>
          </div>
        </div>

        {/* Invoice List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">GST Tax Invoices</p>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-7 pr-3 py-1.5 text-[10px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 w-36"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-slate-300" size={24} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-xs text-slate-400 font-bold">No invoices available yet</p>
              <p className="text-[10px] text-slate-400 mt-1">Invoices are generated when your order is dispatched</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Invoice #', 'Order Ref', 'Date', 'Status', 'Action'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(inv => {
                    const statusUpper = inv.status?.toUpperCase() || '';
                    const canPrint = statusUpper === 'GENERATED' || statusUpper === 'REGENERATED' || statusUpper === 'QUEUED' || statusUpper === 'PAID';
                    const parentOrderId = inv.parentOrderId || inv.parent_order_id || '—';
                    const invoiceNumber = inv.invoiceNumber || inv.invoice_number || inv.id || '—';
                    const dateValue = inv.generatedAt || inv.generated_at || inv.createdAt || inv.created_at || inv.updatedAt || inv.updated_at || inv.queuedAt || inv.queued_at;
                    
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-xs font-black text-indigo-600 font-mono">{invoiceNumber}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-bold text-slate-700 font-mono">{parentOrderId}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[10px] text-slate-500">{fmtDate(dateValue)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${STATUS_STYLES[statusUpper] || STATUS_STYLES[inv.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {canPrint ? (
                            <button
                              onClick={() => handlePrint(inv.id || invoiceNumber)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-[9px] font-black text-indigo-600 hover:bg-indigo-100 transition-colors"
                            >
                              <Printer size={10} /> View / Print
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium italic">
                              {statusUpper === 'QUEUED' || statusUpper === 'GENERATING' ? 'Generating…' : 'Pending dispatch'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
