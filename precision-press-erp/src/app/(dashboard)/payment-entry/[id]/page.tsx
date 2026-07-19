import React from 'react';
import { supabaseServer } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ChevronLeft, FileText, CheckCircle, Wallet, Calendar, User } from 'lucide-react';

export default async function PaymentViewPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const { data: payment, error } = await supabaseServer
    .from('payment_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !payment) {
    return notFound();
  }

  let supplierName = 'Unknown Supplier';
  let supplierEmail = '';

  if (payment.supplier_id) {
    const { data: profile } = await supabaseServer
      .from('profiles')
      .select('name, email')
      .eq('id', payment.supplier_id)
      .single();
      
    if (profile) {
      supplierName = profile.name || supplierName;
      supplierEmail = profile.email || '';
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/payment-register" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Payment Details
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {payment.payment_number || payment.id}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full p-6 mt-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Status Banner */}
          <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center gap-3">
            <CheckCircle className="text-blue-600" size={24} />
            <div>
              <h3 className="font-bold text-blue-900">Payment Processed</h3>
              <p className="text-sm text-blue-700">This payment has been successfully recorded and processed.</p>
            </div>
          </div>

          <div className="p-8 space-y-8">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Supplier Info</h2>
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
                  <User size={20} className="text-slate-400" />
                  {supplierName}
                </div>
                {supplierEmail && (
                  <p className="text-slate-500 mt-1 pl-7">{supplierEmail}</p>
                )}
              </div>
              
              <div className="text-right">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Number</h2>
                <div className="flex items-center gap-2 justify-end text-slate-900 font-bold text-xl font-mono">
                  <FileText size={20} className="text-slate-400" />
                  {payment.payment_number || 'N/A'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-y border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Date</p>
                <div className="flex items-center gap-2 text-slate-900 font-medium">
                  <Calendar size={16} className="text-slate-400" />
                  {format(new Date(payment.payment_date || payment.created_at), 'dd MMM, yyyy')}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Amount Paid</p>
                <div className="flex items-center gap-2 text-red-600 font-bold text-lg">
                  <Wallet size={18} />
                  ₹{Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Payment Mode</p>
                <p className="text-slate-900 font-medium">{payment.payment_mode || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Reference Number</p>
                <p className="text-slate-900 font-medium">{payment.ref_number || 'N/A'}</p>
              </div>
              <div className="col-span-4">
                <p className="text-sm font-semibold text-slate-500 mb-1">Remarks</p>
                <p className="text-slate-700">{payment.remarks || 'No remarks provided.'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
