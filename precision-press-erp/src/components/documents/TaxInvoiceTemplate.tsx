'use client';
import React from 'react';
import { COMPANY_DETAILS, numberToWords } from '@/lib/company-config';

interface TaxInvoiceProps {
  invoice: any;
}

export default function TaxInvoiceTemplate({ invoice }: TaxInvoiceProps) {
  const fmtCurrency = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (v: any) => {
    try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  };

  const isInterState = invoice.customerSnapshot?.stateCode && invoice.customerSnapshot.stateCode !== COMPANY_DETAILS.stateCode;
  
  // Calculate total taxable value and tax
  const subtotal = invoice.amounts?.itemsSubtotal || 0;
  const discount = invoice.amounts?.discount || 0;
  const transport = invoice.amounts?.transport || 0;
  const taxableValue = subtotal - discount + transport;
  
  const gstAmount = invoice.amounts?.gst || 0;
  const grandTotal = invoice.amounts?.grandTotal || (taxableValue + gstAmount);

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
        Tax Invoice
      </div>

      {/* Top Section */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-slate-300 p-3 rounded">
          <p className="font-bold text-sm uppercase text-blue-800">{COMPANY_DETAILS.name}</p>
          <p>{COMPANY_DETAILS.address}</p>
          <p>{COMPANY_DETAILS.city}, {COMPANY_DETAILS.state} - {COMPANY_DETAILS.pincode}</p>
          <p>Email: {COMPANY_DETAILS.email} | Ph: {COMPANY_DETAILS.phone}</p>
          <p className="mt-2 font-bold">GSTIN: {COMPANY_DETAILS.gstin}</p>
          <p className="font-bold">State Code: {COMPANY_DETAILS.stateCode}</p>
        </div>
        
        <div className="border border-slate-300 p-3 rounded grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Invoice No.</p>
            <p className="font-bold text-sm">{invoice.invoiceNumber || invoice.id}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Date</p>
            <p className="font-bold">{fmtDate(invoice.createdAt)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Parent Order Ref.</p>
            <p className="font-bold">{invoice.parentOrderId}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Place of Supply</p>
            <p className="font-bold">{invoice.customerSnapshot?.state || COMPANY_DETAILS.state} ({invoice.customerSnapshot?.stateCode || COMPANY_DETAILS.stateCode})</p>
          </div>
        </div>
      </div>

      {/* Party Details */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-slate-300 p-3 rounded">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 bg-slate-100 p-1">Billed To</p>
          <p className="font-bold">{invoice.customerSnapshot?.businessName || invoice.customerSnapshot?.name}</p>
          {invoice.customerSnapshot?.businessName && <p>{invoice.customerSnapshot?.name}</p>}
          <p className="whitespace-pre-line">{invoice.customerSnapshot?.address || invoice.shippingAddress || 'Address not provided'}</p>
          {(!invoice.customerSnapshot?.address && !invoice.shippingAddress) && <p>{invoice.customerSnapshot?.city} {invoice.customerSnapshot?.state}</p>}
          <p>Ph: {invoice.customerSnapshot?.phone || 'N/A'}</p>
          <p className="mt-1 font-bold">GSTIN/UIN: {invoice.customerSnapshot?.gstNumber || 'Unregistered'}</p>
          <p className="font-bold">State Code: {invoice.customerSnapshot?.stateCode || 'N/A'}</p>
        </div>
        <div className="border border-slate-300 p-3 rounded">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 bg-slate-100 p-1">Shipped To</p>
          <p className="font-bold">{invoice.customerSnapshot?.businessName || invoice.customerSnapshot?.name}</p>
          <p className="whitespace-pre-line">{invoice.shippingAddress || invoice.customerSnapshot?.address || 'Address not provided'}</p>
          {!invoice.shippingAddress && <p>{invoice.customerSnapshot?.city} {invoice.customerSnapshot?.state}</p>}
          <p>Ph: {invoice.customerSnapshot?.phone || 'N/A'}</p>
          <p className="mt-1 font-bold">GSTIN/UIN: {invoice.customerSnapshot?.gstNumber || 'Unregistered'}</p>
          <p className="font-bold">State Code: {invoice.customerSnapshot?.stateCode || 'N/A'}</p>
        </div>
      </div>

      {/* Items Table */}
      <table className="mb-4">
        <thead>
          <tr>
            <th className="w-8 text-center">#</th>
            <th>Description of Goods/Services</th>
            <th className="w-20 text-center">HSN/SAC</th>
            <th className="w-16 text-center">Qty</th>
            <th className="w-16 text-center">Unit</th>
            <th className="w-24 text-right">Rate</th>
            <th className="w-24 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item: any, i: number) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td>
                <span className="font-bold">{item.productName}</span>
                {item.sqft ? <div className="text-[9px] text-slate-500">Total Sq.Ft: {item.sqft.toFixed(2)}</div> : null}
              </td>
              <td className="text-center text-[10px]">{item.hsnCode || '4911'}</td>
              <td className="text-center font-bold">{item.quantity}</td>
              <td className="text-center">Nos</td>
              <td className="text-right">{fmtCurrency((item.itemTotal || 0) / (item.quantity || 1))}</td>
              <td className="text-right font-bold">{fmtCurrency(item.itemTotal || 0)}</td>
            </tr>
          ))}
          
          {/* Empty rows to fill space if needed */}
          {[...Array(Math.max(0, 5 - (invoice.items?.length || 0)))].map((_, i) => (
            <tr key={`empty-${i}`}>
              <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          ))}

          {/* Subtotals & Taxes inside table */}
          <tr>
            <td colSpan={5} rowSpan={6} className="align-top border-r">
              <div className="mb-2">
                <p className="font-bold underline mb-1">Bank Details:</p>
                <p>Bank Name: {COMPANY_DETAILS.bankDetails.bankName}</p>
                <p>A/c Name: {COMPANY_DETAILS.bankDetails.accountName}</p>
                <p>A/c No: {COMPANY_DETAILS.bankDetails.accountNumber}</p>
                <p>IFSC Code: {COMPANY_DETAILS.bankDetails.ifsc}</p>
                <p>Branch: {COMPANY_DETAILS.bankDetails.branch}</p>
              </div>
              <p className="text-[10px] text-slate-500 mt-4">
                Declaration:<br/>
                We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
              </p>
            </td>
            <td className="text-right font-bold bg-slate-50">Subtotal</td>
            <td className="text-right font-bold">{fmtCurrency(subtotal)}</td>
          </tr>
          <tr>
            <td className="text-right bg-slate-50">Discount</td>
            <td className="text-right text-emerald-600">- {fmtCurrency(discount)}</td>
          </tr>
          <tr>
            <td className="text-right bg-slate-50">Transport / Packaging</td>
            <td className="text-right">{fmtCurrency(transport)}</td>
          </tr>
          <tr>
            <td className="text-right font-bold bg-slate-50">Taxable Value</td>
            <td className="text-right font-bold">{fmtCurrency(taxableValue)}</td>
          </tr>
          
          {isInterState ? (
            <tr>
              <td className="text-right bg-slate-50">IGST (18%)</td>
              <td className="text-right">{fmtCurrency(gstAmount)}</td>
            </tr>
          ) : (
            <>
              <tr>
                <td className="text-right bg-slate-50">CGST (9%)</td>
                <td className="text-right">{fmtCurrency(gstAmount / 2)}</td>
              </tr>
              <tr>
                <td className="text-right bg-slate-50">SGST (9%)</td>
                <td className="text-right">{fmtCurrency(gstAmount / 2)}</td>
              </tr>
            </>
          )}

          <tr>
            <td className="text-right font-bold text-sm bg-slate-100">Grand Total</td>
            <td className="text-right font-bold text-sm bg-slate-100">{fmtCurrency(grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Amount in words */}
      <div className="border border-slate-300 p-2 rounded mb-6 bg-slate-50">
        <span className="font-bold">Total Invoice Amount in Words: </span>
        <span className="uppercase">{numberToWords(grandTotal)}</span>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 mt-12">
        <div className="text-center">
          <div className="border-b border-slate-400 w-48 mx-auto mb-2 mt-8"></div>
          <p className="font-bold text-[10px]">Receiver's Signature / Seal</p>
        </div>
        <div className="text-center">
          <p className="font-bold text-[10px] mb-8">For {COMPANY_DETAILS.name}</p>
          <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
          <p className="font-bold text-[10px]">Authorized Signatory</p>
        </div>
      </div>
      
      <div className="text-center text-[9px] text-slate-400 mt-6 pb-4">
        SUBJECT TO {COMPANY_DETAILS.city.toUpperCase()} JURISDICTION
        <br />
        This is a computer-generated invoice.
      </div>
    </div>
  );
}
