'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, CheckCircle, FileText, Loader2, IndianRupee, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function OrderInvoiceGenerationPage({ params }: { params: { orderId: string } }) {
  const [parentOrder, setParentOrder] = useState<any>(null);
  const [childOrders, setChildOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const [parentRes, childrenRes] = await Promise.all([
        supabase.from('orders').select('*').eq('id', params.orderId).single(),
        supabase.from('orders').select('*').eq('base_order_id', params.orderId).order('created_at', { ascending: true })
      ]);

      if (parentRes.data) setParentOrder(parentRes.data);
      if (childrenRes.data) setChildOrders(childrenRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [params.orderId]);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    const selectable = childOrders.filter(o => !o.invoice_generated);
    if (selectedIds.size === selectable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map(o => o.id)));
    }
  };

  const generateInvoice = async () => {
    if (selectedIds.size === 0) return;
    setGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childOrderIds: Array.from(selectedIds),
          parentOrderId: parentOrder.id,
          customerId: parentOrder.customer_id,
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate invoice');
      }

      setSuccessMsg(`Invoice ${data.invoiceNumber || data.invoiceId} generated successfully!`);
      setSelectedIds(new Set());
      await fetchOrders(); // Refresh table to show newly generated invoices
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred');
    } finally {
      setGenerating(false);
    }
  };

  const fmtCurrency = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  // Summary Calculations
  const selectedRows = childOrders.filter(o => selectedIds.has(o.id));
  const summaryTaxable = selectedRows.reduce((acc, o) => acc + (o.taxable_value_snapshot || 0), 0);
  const summaryCgst = selectedRows.reduce((acc, o) => acc + (o.cgst_amount || 0), 0);
  const summarySgst = selectedRows.reduce((acc, o) => acc + (o.sgst_amount || 0), 0);
  const summaryIgst = selectedRows.reduce((acc, o) => acc + (o.igst_amount || 0), 0);
  const summaryLogistics = selectedRows.reduce((acc, o) => acc + (o.allocated_logistics_amount || 0), 0);
  const summaryGrandTotal = selectedRows.reduce((acc, o) => acc + (o.grand_total_snapshot || 0), 0);

  const selectableCount = childOrders.filter(o => !o.invoice_generated).length;
  const allSelected = selectableCount > 0 && selectedIds.size === selectableCount;

  return (
    <div className="p-6 max-w-7xl mx-auto pb-40">
      <div className="mb-6">
        {parentOrder && (
          <Link href={`/admin/invoices/customers/${parentOrder.customer_id}`} className="flex items-center text-sm text-blue-600 hover:text-blue-800 mb-2 font-medium">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Customer Orders
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight">Child Order Selection</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">
          Parent Ref: {params.orderId}
        </p>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center shadow-sm">
          <CheckCircle className="w-5 h-5 mr-2 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center shadow-sm">
          <FileText className="w-5 h-5 mr-2 text-red-600" />
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-48 bg-white rounded-lg border shadow-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableCount === 0 || generating}
                    />
                  </th>
                  <th className="px-4 py-3">Child Order</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Taxable</th>
                  <th className="px-4 py-3 text-right">GST</th>
                  <th className="px-4 py-3 text-right">Logistics</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {childOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No child orders found.
                    </td>
                  </tr>
                )}
                {childOrders.map(child => {
                  const isInvoiced = child.invoice_generated === true;
                  const isChecked = selectedIds.has(child.id);
                  const gstTotal = (child.cgst_amount || 0) + (child.sgst_amount || 0) + (child.igst_amount || 0);
                  
                  // Product name fallback
                  const productLabel = child.productName || (child.product_snapshot?.name) || 'Unknown Product';

                  return (
                    <tr 
                      key={child.id} 
                      className={`transition-colors ${isInvoiced ? 'bg-gray-50/50' : isChecked ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-4 py-4 text-center align-middle">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 disabled:opacity-50"
                          checked={isChecked}
                          onChange={() => toggleSelect(child.id)}
                          disabled={isInvoiced || generating}
                        />
                      </td>
                      <td className="px-4 py-4 align-middle font-mono text-xs text-gray-600">
                        {child.id.slice(0, 14)}...
                      </td>
                      <td className="px-4 py-4 align-middle text-gray-800 font-medium">
                        {productLabel}
                      </td>
                      <td className="px-4 py-4 align-middle text-right text-gray-700">
                        {fmtCurrency(child.taxable_value_snapshot)}
                      </td>
                      <td className="px-4 py-4 align-middle text-right text-gray-700">
                        {fmtCurrency(gstTotal)}
                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                          {child.gst_type || 'CGST/SGST'}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle text-right text-gray-700">
                        {fmtCurrency(child.allocated_logistics_amount)}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        {isInvoiced ? (
                          <div className="flex flex-col">
                            <span className="px-2 py-0.5 rounded border text-[10px] font-bold bg-blue-50 text-blue-600 border-blue-200 self-start">
                              GENERATED
                            </span>
                            {child.invoice_number && (
                              <span className="text-xs font-mono text-gray-500 mt-1">
                                {child.invoice_number}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded border text-[10px] font-bold bg-amber-50 text-amber-600 border-amber-200 self-start">
                            PENDING
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-middle text-center">
                        {isInvoiced && child.invoice_id ? (
                          <Link href={`/admin/invoices/${child.invoice_id}`} className="inline-flex items-center justify-center p-1.5 rounded-full hover:bg-blue-100 text-blue-600 transition-colors" title="View Invoice">
                            <ArrowRight className="w-5 h-5" />
                          </Link>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Live Summary Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 px-6 lg:px-8 z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-6 overflow-x-auto text-sm w-full sm:w-auto">
          <div>
            <div className="text-gray-500 text-xs font-medium mb-1">Selected</div>
            <div className="font-bold text-gray-900">{selectedIds.size} Items</div>
          </div>
          <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>
          <div>
            <div className="text-gray-500 text-xs font-medium mb-1">Taxable Value</div>
            <div className="font-bold text-gray-900">{fmtCurrency(summaryTaxable)}</div>
          </div>
          <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>
          <div>
            <div className="text-gray-500 text-xs font-medium mb-1">GST Total</div>
            <div className="font-bold text-gray-900">{fmtCurrency(summaryCgst + summarySgst + summaryIgst)}</div>
          </div>
          <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>
          <div>
            <div className="text-gray-500 text-xs font-medium mb-1">Logistics</div>
            <div className="font-bold text-gray-900">{fmtCurrency(summaryLogistics)}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto">
          <div className="text-right hidden sm:block">
            <div className="text-gray-500 text-xs font-medium mb-1">Grand Total</div>
            <div className="font-bold text-blue-600 text-lg flex items-center justify-end">
              {fmtCurrency(summaryGrandTotal)}
            </div>
          </div>
          
          <button
            onClick={generateInvoice}
            disabled={selectedIds.size === 0 || generating}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                Generate Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
