'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, Printer, ShieldCheck, Download, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function InvoiceDetailsPage({ params }: { params: { id: string } }) {
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  useEffect(() => {
    async function fetchInvoice() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', params.id)
          .single();
        if (data) setInvoice(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchInvoice();
  }, [params.id]);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`/api/invoices/${params.id}/verify`, { method: 'POST' });
      const data = await res.json();
      setVerifyResult(data);
      // Update local invoice state with new status if verified
      if (data.status === 'VERIFIED') {
        setInvoice((prev: any) => ({ ...prev, invoice_integrity_status: 'VERIFIED' }));
      }
    } catch (e) {
      setVerifyResult({ error: 'Failed to connect to verification API.' });
    } finally {
      setVerifying(false);
    }
  };

  const fmtCurrency = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-IN') : '—';

  if (loading) {
    return <div className="p-6">Loading invoice details...</div>;
  }

  if (!invoice) {
    return <div className="p-6">Invoice not found.</div>;
  }

  const cust = invoice.customer_snapshot || {};
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  return (
    <div className="p-6 max-w-5xl mx-auto pb-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/admin/invoices/customers/${invoice.customer_id}`} className="flex items-center text-sm text-blue-600 hover:text-blue-800 mb-2 font-medium">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Invoice History
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Invoice {invoice.invoice_number}</h1>
          <p className="text-muted-foreground text-sm">
            Status: <span className="font-semibold text-slate-800">{invoice.status}</span> • Generated: {fmtDate(invoice.generated_at)}
          </p>
        </div>
        <div className="flex gap-3">
          {invoice.pdf_url && (
            <a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" /> Download PDF
            </a>
          )}
          <Link href={`/admin/invoices/${invoice.id}/print`} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
            <Printer className="w-4 h-4" /> Print View
          </Link>
          <button 
            onClick={handleVerify} 
            disabled={verifying}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {verifying ? 'Verifying...' : <><ShieldCheck className="w-4 h-4" /> Verify Integrity</>}
          </button>
        </div>
      </div>

      {verifyResult && (
        <div className={`mb-6 p-4 rounded-md border ${verifyResult.status === 'VERIFIED' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <div className="flex items-center gap-2 font-bold mb-1">
            {verifyResult.status === 'VERIFIED' ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            Integrity Verification: {verifyResult.status}
          </div>
          <div className="text-sm mt-2 space-y-1">
            <p><strong>Snapshot Hash Match:</strong> {verifyResult.details?.snapshotHashMatch ? '✅ Yes' : '❌ No'}</p>
            <p><strong>PDF Hash Match:</strong> {verifyResult.details?.pdfHashMatch ? '✅ Yes' : '❌ No'}</p>
            <p className="font-mono text-[10px] mt-2 text-slate-500 break-all">Calculated Hash: {verifyResult.details?.calculatedSnapshotHash}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-5 rounded-md border shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3 border-b pb-2">Customer Snapshot</h3>
          <div className="text-sm space-y-2 text-slate-600">
            <p><span className="font-medium text-slate-800">Name:</span> {cust.name}</p>
            <p><span className="font-medium text-slate-800">Company:</span> {cust.company_name || 'N/A'}</p>
            <p><span className="font-medium text-slate-800">GSTIN:</span> {cust.gstin || 'Unregistered'}</p>
            <p><span className="font-medium text-slate-800">Email:</span> {cust.email}</p>
            <p><span className="font-medium text-slate-800">Billing Address:</span> {cust.billing_address?.address_line || 'N/A'}, {cust.billing_address?.city}, {cust.billing_address?.state}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-md border shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3 border-b pb-2">Invoice Summary</h3>
          <div className="text-sm space-y-2 text-slate-600">
            <div className="flex justify-between"><span className="font-medium text-slate-800">Taxable Value:</span> <span>{fmtCurrency(invoice.taxable_value)}</span></div>
            {invoice.is_inter_state ? (
              <div className="flex justify-between"><span className="font-medium text-slate-800">IGST:</span> <span>{fmtCurrency(invoice.igst_amount)}</span></div>
            ) : (
              <>
                <div className="flex justify-between"><span className="font-medium text-slate-800">CGST:</span> <span>{fmtCurrency(invoice.cgst_amount)}</span></div>
                <div className="flex justify-between"><span className="font-medium text-slate-800">SGST:</span> <span>{fmtCurrency(invoice.sgst_amount)}</span></div>
              </>
            )}
            <div className="flex justify-between"><span className="font-medium text-slate-800">Round Off:</span> <span>{fmtCurrency(invoice.round_off)}</span></div>
            <div className="flex justify-between pt-2 border-t font-bold text-base text-slate-900"><span>Grand Total:</span> <span>{fmtCurrency(invoice.grand_total)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-md border shadow-sm overflow-hidden">
        <h3 className="font-bold text-slate-800 p-5 border-b bg-slate-50">Line Items</h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
            <tr>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">HSN</th>
              <th className="px-5 py-3 text-right">Qty</th>
              <th className="px-5 py-3 text-right">Rate</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item: any, idx: number) => (
              <tr key={idx}>
                <td className="px-5 py-3 text-slate-800">
                  <div className="font-medium">{item.product_name}</div>
                  <div className="text-xs text-slate-500 mt-1">{item.size} | {item.material}</div>
                </td>
                <td className="px-5 py-3 text-slate-600">{item.hsn_code}</td>
                <td className="px-5 py-3 text-right text-slate-600">{item.quantity}</td>
                <td className="px-5 py-3 text-right text-slate-600">{fmtCurrency(item.unit_price)}</td>
                <td className="px-5 py-3 text-right font-medium text-slate-800">{fmtCurrency(item.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
