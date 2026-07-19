'use client';
import React from 'react';
import { COMPANY_DETAILS, numberToWords } from '@/lib/company-config';

interface ReceiptVoucherProps {
  payment: any;
  order: any;
}

export default function ReceiptVoucherTemplate({ payment, order }: ReceiptVoucherProps) {
  const fmtCurrency = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (v: any) => {
    try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  };

  const isInterState = order.customerSnapshot?.stateCode && order.customerSnapshot.stateCode !== COMPANY_DETAILS.stateCode;
  
  // Backwards calculation for GST included in advance (Assuming 18% overall)
  const totalReceived = payment.amount || payment.amountReceived || 0;
  const taxableValue = totalReceived / 1.18;
  const gstAmount = totalReceived - taxableValue;

  return (
    <div className="max-w-4xl mx-auto p-10 bg-white min-h-screen text-slate-900 text-[11px] leading-tight" style={{ fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          @page { size: A4; margin: 10mm; }
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #cbd5e1; padding: 4px 6px; }
        th { background-color: #f1f5f9; font-weight: bold; text-align: left; }
      `}</style>

      {/* Header */}
      <div className="text-center font-bold text-lg mb-4 uppercase tracking-widest border-b-2 border-slate-900 pb-2">
        Receipt Voucher
        <p className="text-[9px] font-normal lowercase tracking-normal">(Issued under Rule 50 of the CGST Rules)</p>
      </div>

      {/* Top Section */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-slate-300 p-3 rounded">
          <p className="font-bold text-sm uppercase text-blue-800">{COMPANY_DETAILS.name}</p>
          <p>{COMPANY_DETAILS.address}</p>
          <p>{COMPANY_DETAILS.city}, {COMPANY_DETAILS.state} - {COMPANY_DETAILS.pincode}</p>
          <p className="mt-2 font-bold">GSTIN: {COMPANY_DETAILS.gstin}</p>
        </div>
        
        <div className="border border-slate-300 p-3 rounded grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Receipt No.</p>
            <p className="font-bold text-sm">{payment.id}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Date of Receipt</p>
            <p className="font-bold">{fmtDate(payment.verifiedAt || payment.createdAt)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Order Reference</p>
            <p className="font-bold">{order.id}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Payment Mode</p>
            <p className="font-bold">{payment.method || 'Online / Bank Transfer'}</p>
          </div>
        </div>
      </div>

      {/* Customer Details */}
      <div className="border border-slate-300 p-3 rounded mb-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 bg-slate-100 p-1">Received From (Customer)</p>
        <p className="font-bold">{order.customerSnapshot?.businessName || order.customerSnapshot?.name}</p>
        {order.customerSnapshot?.businessName && <p>{order.customerSnapshot?.name}</p>}
        <p className="whitespace-pre-line">{order.shippingAddress || order.customerSnapshot?.address || 'Address not provided'}</p>
        {!order.shippingAddress && <p>{order.customerSnapshot?.city} {order.customerSnapshot?.state}</p>}
        <p className="mt-1 font-bold">GSTIN/UIN: {order.customerSnapshot?.gstNumber || 'Unregistered'}</p>
        <p className="font-bold">Place of Supply: {order.customerSnapshot?.state || COMPANY_DETAILS.state} ({order.customerSnapshot?.stateCode || COMPANY_DETAILS.stateCode})</p>
      </div>

      {/* Payment Details Table */}
      <table className="mb-4">
        <thead>
          <tr>
            <th>Description</th>
            <th className="w-32 text-right">Taxable Value</th>
            <th className="w-32 text-right">GST Rate</th>
            <th className="w-32 text-right">Total Amount Received</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-8">
              <span className="font-bold block text-sm">Advance Payment for Order #{order.id}</span>
              <span className="text-[10px] text-slate-500 mt-1 block">Reference: {payment.referenceId || payment.transactionId || 'N/A'}</span>
            </td>
            <td className="text-right font-bold">{fmtCurrency(taxableValue)}</td>
            <td className="text-right text-[10px]">{isInterState ? '18% IGST' : '9% CGST + 9% SGST'}</td>
            <td className="text-right font-bold text-sm">{fmtCurrency(totalReceived)}</td>
          </tr>
        </tbody>
      </table>

      {/* Tax Breakdown */}
      <div className="flex justify-end mb-4">
        <table className="w-64 border-none">
          <tbody>
            <tr>
              <td className="text-right bg-slate-50 font-bold border-0 border-b border-slate-200">Taxable Amount</td>
              <td className="text-right border-0 border-b border-slate-200">{fmtCurrency(taxableValue)}</td>
            </tr>
            {isInterState ? (
              <tr>
                <td className="text-right bg-slate-50 border-0 border-b border-slate-200">IGST</td>
                <td className="text-right border-0 border-b border-slate-200">{fmtCurrency(gstAmount)}</td>
              </tr>
            ) : (
              <>
                <tr>
                  <td className="text-right bg-slate-50 border-0 border-b border-slate-200">CGST</td>
                  <td className="text-right border-0 border-b border-slate-200">{fmtCurrency(gstAmount / 2)}</td>
                </tr>
                <tr>
                  <td className="text-right bg-slate-50 border-0 border-b border-slate-200">SGST</td>
                  <td className="text-right border-0 border-b border-slate-200">{fmtCurrency(gstAmount / 2)}</td>
                </tr>
              </>
            )}
            <tr>
              <td className="text-right font-bold bg-slate-100 border-0 border-t border-slate-400 py-2">Total Received</td>
              <td className="text-right font-bold text-sm bg-slate-100 border-0 border-t border-slate-400 py-2">{fmtCurrency(totalReceived)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount in words */}
      <div className="border border-slate-300 p-2 rounded mb-6 bg-slate-50">
        <span className="font-bold">Amount Received in Words: </span>
        <span className="uppercase">{numberToWords(totalReceived)}</span>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 mt-16">
        <div></div>
        <div className="text-center">
          <p className="font-bold text-[10px] mb-8">For {COMPANY_DETAILS.name}</p>
          <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
          <p className="font-bold text-[10px]">Authorized Signatory</p>
        </div>
      </div>
      
      <div className="text-center text-[9px] text-slate-400 mt-6 pb-4">
        This is a computer-generated receipt voucher.
      </div>
    </div>
  );
}
