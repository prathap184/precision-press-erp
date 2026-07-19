'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import { updateQuotationStatus } from '@/lib/actions/quotations';
import { useRouter } from 'next/navigation';

export function QuotationViewer({ quotation }: { quotation: any }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const router = useRouter();
  const customerInfo = quotation.customer_snapshot || {};
  const logistics = quotation.logistics_snapshot || {};

  const handleStatusUpdate = async (status: 'ACCEPTED' | 'REJECTED') => {
    try {
      setIsUpdating(true);
      await updateQuotationStatus(quotation.id, status);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert('Failed to update quotation status.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white shadow-xl border border-slate-200/60 overflow-hidden">
      <div className="bg-slate-900 px-8 py-6 text-white flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Quotation #{quotation.quotation_number}</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">
            Generated on {format(new Date(quotation.created_at), 'MMM dd, yyyy')}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-400 font-medium">Status</div>
          <div className={`text-lg font-black uppercase tracking-widest ${
            quotation.status === 'ACCEPTED' ? 'text-emerald-400' :
            quotation.status === 'REJECTED' ? 'text-rose-400' : 'text-amber-400'
          }`}>
            {quotation.status || 'PENDING'}
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Customer Details</h3>
            <p className="font-bold text-slate-900">{customerInfo.name || quotation.profiles?.display_name}</p>
            {customerInfo.phone && <p className="text-sm text-slate-600">{customerInfo.phone}</p>}
            {customerInfo.email && <p className="text-sm text-slate-600">{customerInfo.email}</p>}
            {customerInfo.address && <p className="text-sm text-slate-600 mt-1">{customerInfo.address}</p>}
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Logistics / Address</h3>
            <p className="text-sm font-bold text-slate-900">{logistics.method || 'Not Specified'}</p>
            {logistics.address && <p className="text-sm text-slate-600 mt-1">{logistics.address}</p>}
            {logistics.city && <p className="text-sm text-slate-600">{logistics.city}, {logistics.state} {logistics.pincode}</p>}
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Quotation Items</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotation.items?.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.productName || item.product_name}</td>
                    <td className="px-4 py-3 text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-right">Rs. {Number(item.rate).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      Rs. {(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="font-bold">Rs. {Number(quotation.amounts?.subtotal || 0).toFixed(2)}</span>
            </div>
            {quotation.amounts?.transport > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Transport</span>
                <span className="font-bold">Rs. {Number(quotation.amounts?.transport).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-slate-600">
              <span>GST</span>
              <span className="font-bold">Rs. {Number((quotation.amounts?.cgst || 0) + (quotation.amounts?.sgst || 0) + (quotation.amounts?.igst || 0)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-slate-200">
              <span className="font-black text-slate-900">Grand Total</span>
              <span className="font-black text-slate-900">
                Rs. {Number(quotation.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {(!quotation.status || quotation.status === 'PENDING') && (
          <div className="flex justify-center gap-4 border-t border-slate-100 pt-8 mt-8">
            <button
              onClick={() => handleStatusUpdate('REJECTED')}
              disabled={isUpdating}
              className="flex items-center gap-2 px-8 py-3 rounded-full border-2 border-slate-200 text-slate-600 font-bold hover:border-rose-200 hover:text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50"
            >
              <XCircle size={20} />
              Reject Quotation
            </button>
            <button
              onClick={() => handleStatusUpdate('ACCEPTED')}
              disabled={isUpdating}
              className="flex items-center gap-2 px-8 py-3 rounded-full bg-slate-900 text-white font-bold shadow-lg hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50"
            >
              {isUpdating ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
              Accept Quotation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
