'use client';
import React from 'react';
import { COMPANY_DETAILS } from '@/lib/company-config';

interface DeliveryChallanProps {
  order: any;
  challanNumber?: string;
  transporterName?: string;
  vehicleNumber?: string;
}

export default function DeliveryChallanTemplate({ order, challanNumber, transporterName, vehicleNumber }: DeliveryChallanProps) {
  const fmtCurrency = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (v: any) => {
    try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  };

  const isInterState = order.customerSnapshot?.stateCode && order.customerSnapshot.stateCode !== COMPANY_DETAILS.stateCode;
  const challanNo = challanNumber || `DC-${order.id}`;

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
        Delivery Challan
        <p className="text-[9px] font-normal lowercase tracking-normal">(Issued under Rule 55 of the CGST Rules)</p>
      </div>

      {/* Top Section */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-slate-300 p-3 rounded">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 bg-slate-100 p-1">Consignor (Sender)</p>
          <p className="font-bold text-sm uppercase text-blue-800">{COMPANY_DETAILS.name}</p>
          <p>{COMPANY_DETAILS.address}</p>
          <p>{COMPANY_DETAILS.city}, {COMPANY_DETAILS.state} - {COMPANY_DETAILS.pincode}</p>
          <p className="mt-2 font-bold">GSTIN: {COMPANY_DETAILS.gstin}</p>
        </div>
        
        <div className="border border-slate-300 p-3 rounded grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Challan No.</p>
            <p className="font-bold text-sm">{challanNo}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Date of Issue</p>
            <p className="font-bold">{fmtDate(new Date())}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Order Reference</p>
            <p className="font-bold">{order.id}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Purpose of Challan</p>
            <p className="font-bold">Sale / Delivery to Customer</p>
          </div>
        </div>
      </div>

      {/* Consignee Details */}
      <div className="border border-slate-300 p-3 rounded mb-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 bg-slate-100 p-1">Consignee (Receiver) / Delivery Address</p>
        <p className="font-bold">{order.customerSnapshot?.businessName || order.customerSnapshot?.name}</p>
        {order.customerSnapshot?.businessName && <p>{order.customerSnapshot?.name}</p>}
        <p className="whitespace-pre-line">{order.shippingAddress || order.customerSnapshot?.address || 'Address not provided'}</p>
        {!order.shippingAddress && <p>{order.customerSnapshot?.city} {order.customerSnapshot?.state}</p>}
        <p>Ph: {order.customerSnapshot?.phone || 'N/A'}</p>
        <p className="mt-1 font-bold">GSTIN/UIN: {order.customerSnapshot?.gstNumber || 'Unregistered'}</p>
        <p className="font-bold">Place of Supply: {order.customerSnapshot?.state || COMPANY_DETAILS.state} ({order.customerSnapshot?.stateCode || COMPANY_DETAILS.stateCode})</p>
      </div>

      {/* Items Table */}
      <table className="mb-4">
        <thead>
          <tr>
            <th className="w-8 text-center">#</th>
            <th>Description of Goods</th>
            <th className="w-20 text-center">HSN Code</th>
            <th className="w-16 text-center">Qty</th>
            <th className="w-24 text-right">Taxable Value</th>
            <th className="w-24 text-right">GST Rate</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((item: any, i: number) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td>
                <span className="font-bold">{item.productName}</span>
                {item.sqft ? <div className="text-[9px] text-slate-500">Total Sq.Ft: {item.sqft.toFixed(2)}</div> : null}
              </td>
              <td className="text-center text-[10px]">{item.hsnCode || '4911'}</td>
              <td className="text-center font-bold">{item.quantity || item.specs?.quantity}</td>
              <td className="text-right">{fmtCurrency(item.itemTotal || item.pricingSnapshot?.subTotal || 0)}</td>
              <td className="text-right text-[10px]">{isInterState ? '18% IGST' : '9% CGST + 9% SGST'}</td>
            </tr>
          ))}
          
          {/* Empty rows */}
          {[...Array(Math.max(0, 5 - (order.items?.length || 0)))].map((_, i) => (
            <tr key={`empty-${i}`}>
              <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Transport Details */}
      <div className="border border-slate-300 p-3 rounded mb-8 bg-slate-50">
        <p className="font-bold text-sm mb-2 border-b border-slate-300 pb-1">Transport Details</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase">Transporter Name</p>
            <p className="font-bold">{transporterName || 'Self / Courier'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase">Vehicle Number</p>
            <p className="font-bold">{vehicleNumber || 'N/A'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase">Approximate Total Value</p>
            <p className="font-bold">{fmtCurrency(order.amounts?.grandTotal || 0)}</p>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 mt-16">
        <div className="text-center">
          <p className="font-bold text-[10px] mb-8">For {order.customerSnapshot?.businessName || order.customerSnapshot?.name}</p>
          <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
          <p className="font-bold text-[10px]">Received in Good Condition</p>
          <p className="text-[9px] text-slate-400">(Consignee Signature / Seal)</p>
        </div>
        <div className="text-center">
          <p className="font-bold text-[10px] mb-8">For {COMPANY_DETAILS.name}</p>
          <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
          <p className="font-bold text-[10px]">Authorized Signatory</p>
        </div>
      </div>
    </div>
  );
}
