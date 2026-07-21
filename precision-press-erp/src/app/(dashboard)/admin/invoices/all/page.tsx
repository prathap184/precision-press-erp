'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

import { RoleGuard } from '@/lib/role-guard';
import { FileText, Search, Download, RefreshCw, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionMsg, setActionMsg] = useState<{ invoiceId: string; msg: string; success: boolean } | null>(null);



  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && data) setInvoices(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchInvoices(); }, []);

  const filtered = invoices.filter(inv => {
    if (!search) return true;
    const s = search.toLowerCase();
    const num = inv.invoice_number || '';
    const pid = inv.parent_order_id || '';
    const cname = inv.customer_snapshot?.name || '';
    return num.toLowerCase().includes(s) || pid.toLowerCase().includes(s) || cname.toLowerCase().includes(s);
  });

  const fmtDate = (v: any) => { try { return v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; } catch { return '—'; } };
  const fmtCurrency = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const statusConfig: Record<string, { label: string; cls: string; icon?: React.ReactNode }> = {
    PENDING:             { label: 'Pending',           cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    GENERATING:          { label: 'Generating…',       cls: 'bg-sky-50 text-sky-600 border-sky-200' },
    GENERATED:           { label: 'Generated',         cls: 'bg-blue-50 text-blue-600 border-blue-200' },
    SENT:                { label: 'Sent',              cls: 'bg-purple-50 text-purple-600 border-purple-200' },
    PAID:                { label: 'Paid',              cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    FAILED:              { label: 'Failed',            cls: 'bg-red-50 text-red-600 border-red-200' },
    PERMANENTLY_FAILED:  { label: 'Perm. Failed',      cls: 'bg-rose-100 text-rose-700 border-rose-300' },
    DLQ:                 { label: 'DLQ',               cls: 'bg-red-100 text-red-800 border-red-300' },
    CANCELLED:           { label: 'Cancelled',         cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    DISPATCH_ROLLED_BACK:{ label: 'Rolled Back',       cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  };

  const handleSyncToTally = async (invoiceId: string) => {
    setActionMsg({ invoiceId, msg: 'Syncing...', success: true });
    try {
      const { syncGeneratedInvoiceToTally } = await import('@/lib/actions/tally-sync');
      const res = await syncGeneratedInvoiceToTally(invoiceId, 'admin');
      if (res.success) {
        setActionMsg({ invoiceId, msg: 'Queued for Tally sync', success: true });
        setTimeout(() => setActionMsg(null), 3000);
      } else {
        setActionMsg({ invoiceId, msg: `Failed: ${res.error}`, success: false });
        setTimeout(() => setActionMsg(null), 5000);
      }
    } catch(e: any) {
      setActionMsg({ invoiceId, msg: `Error: ${e.message}`, success: false });
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  // Note: Invoice regeneration is now done via the Invoice Generation module.
  // This listing page is read-only — no retry/generate-again action.
  // Summary counts
  const failedCount = invoices.filter(i => ['FAILED', 'PERMANENTLY_FAILED', 'DLQ'].includes(i.status)).length;
  const generatedCount = invoices.filter(i => i.status === 'GENERATED').length;

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER']}>
      <div className="space-y-4 pb-10">
        {/* Header */}
        <section className="flex items-center justify-between px-4 bg-white py-3 border-b border-slate-200 -mt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded text-white"><FileText size={18} /></div>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-wider">Invoice Dashboard</h1>
              <p className="text-[10px] text-slate-500">
                {invoices.length} total · <span className="text-emerald-600 font-bold">{generatedCount} generated</span>
                {failedCount > 0 && <span className="text-red-600 font-bold ml-2">⚠ {failedCount} failed</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search invoice #, order, customer..."
                className="pl-7 pr-3 py-2 text-[10px] bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 w-56"
              />
            </div>
            <button
              onClick={fetchInvoices}
              className="flex items-center gap-1 px-3 py-2 text-[10px] bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </section>

        {/* Action feedback */}
        {actionMsg && (
          <div className={`mx-4 px-4 py-2 rounded text-[11px] font-medium border ${actionMsg.success ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {actionMsg.msg}
            <button onClick={() => setActionMsg(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Table */}
        <div className="px-4">
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Invoice #', 'Order', 'Customer', 'Date', 'Taxable', 'GST', 'Total', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={9} className="py-16 text-center"><Loader2 className="animate-spin text-slate-300 mx-auto" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={9} className="py-16 text-center text-xs text-slate-400">No invoices found</td></tr>
                  ) : filtered.map(inv => {
                    const status = inv.status?.toUpperCase() || 'GENERATED';
                    const cfg = statusConfig[status] || { label: status, cls: 'bg-slate-50 text-slate-500 border-slate-200' };
                    const isFailed = ['FAILED', 'PERMANENTLY_FAILED', 'DLQ'].includes(status);
                    return (
                      <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${isFailed ? 'bg-red-50/30' : ''}`}>

                        <td className="px-4 py-3">
                          <p className="text-[11px] font-black text-blue-600 font-mono">{inv.invoice_number || inv.id}</p>
                          {inv.financial_year && <p className="text-[9px] text-slate-400 font-mono">{inv.financial_year}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[10px] font-bold text-slate-700 font-mono">{inv.parent_order_id}</p>
                          {inv.attempt_count > 0 && <p className="text-[9px] text-slate-400">{inv.attempt_count}/{inv.max_attempts || 6} attempts</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[10px] font-bold text-slate-700">{inv.customer_snapshot?.name || '—'}</p>
                          <p className="text-[9px] text-slate-400">{inv.customer_snapshot?.gstin || 'Unregistered'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[10px] text-slate-500">{fmtDate(inv.invoice_date || inv.created_at)}</p>
                          {inv.generated_at && <p className="text-[9px] text-slate-400">Generated: {fmtDate(inv.generated_at)}</p>}
                        </td>
                        <td className="px-4 py-3"><p className="text-[10px] font-bold text-slate-700">{fmtCurrency(inv.taxable_value)}</p></td>
                        <td className="px-4 py-3">
                          <p className="text-[10px] font-bold text-slate-700">{fmtCurrency(Number(inv.cgst_amount) + Number(inv.sgst_amount) + Number(inv.igst_amount))}</p>
                          {inv.cgst_amount > 0 && <p className="text-[9px] text-slate-400">CGST+SGST</p>}
                        </td>
                        <td className="px-4 py-3"><p className="text-xs font-black text-slate-900">{fmtCurrency(inv.grand_total)}</p></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-black uppercase ${cfg.cls}`}>
                            {isFailed && <AlertTriangle size={8} />}
                            {status === 'GENERATED' && <CheckCircle size={8} />}
                            {cfg.label}
                          </span>
                          {isFailed && inv.last_error && (
                            <p className="text-[8px] text-red-500 mt-0.5 max-w-[120px] truncate" title={inv.last_error}>{inv.last_error}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {status === 'GENERATED' && (
                              <>
                                <button
                                  onClick={() => window.open(`/documents/invoice/${inv.parent_order_id}/print`, '_blank')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded text-[9px] font-black text-blue-600 hover:bg-blue-100 transition-colors"
                                >
                                  <Download size={9} /> PDF
                                </button>
                                <button
                                  onClick={() => handleSyncToTally(inv.id)}
                                  disabled={actionMsg?.invoiceId === inv.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded text-[9px] font-black text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                                >
                                  <RefreshCw size={9} className={actionMsg?.invoiceId === inv.id ? 'animate-spin' : ''} /> 
                                  {actionMsg?.invoiceId === inv.id ? 'SYNCING...' : 'SYNC TALLY'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
