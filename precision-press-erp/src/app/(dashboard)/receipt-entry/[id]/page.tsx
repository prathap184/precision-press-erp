import React from 'react';
import { supabaseServer } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ChevronLeft, FileText, CheckCircle, Wallet, Calendar, User, CreditCard, Hash, Building2, Smartphone } from 'lucide-react';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${color}`}>
      {label}
    </span>
  );
}

export default async function ReceiptViewPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const { data: transaction, error } = await supabaseServer
    .from('transactions')
    .select('*')
    .eq('receipt_entry_number', id)
    .maybeSingle()
    .then(async (res) => {
      if (res.data) return res;
      // fallback: try by id
      return supabaseServer.from('transactions').select('*').eq('id', id).maybeSingle();
    });

  if (error || !transaction) {
    return notFound();
  }

  let customerName = 'Unknown Customer';
  let customerEmail = '';

  if (transaction.userId) {
    const { data: profile } = await supabaseServer
      .from('contact')
      .select('name, email')
      .eq('id', transaction.userId)
      .single();
      
    if (profile) {
      customerName = profile.name || customerName;
      customerEmail = profile.email || '';
    }
  }

  const paymentMode: string = transaction.paymentMode || 'CASH';
  const modeLabel = PAYMENT_MODE_LABELS[paymentMode] || paymentMode;

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/receipt-register" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Receipt Details</h1>
            <p className="text-sm text-slate-500 mt-0.5">{transaction.receipt_entry_number || transaction.id}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full p-6 mt-6 space-y-5">

        {/* Status Banner */}
        <div className="bg-emerald-50 px-6 py-4 rounded-xl border border-emerald-100 flex items-center gap-3">
          <CheckCircle className="text-emerald-600 shrink-0" size={24} />
          <div>
            <h3 className="font-bold text-emerald-900">Receipt Verified</h3>
            <p className="text-sm text-emerald-700">This payment has been successfully recorded and verified.</p>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

          {/* Customer + Receipt Number */}
          <div className="p-6 flex flex-col md:flex-row md:justify-between md:items-start gap-4 border-b border-slate-100">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Customer Info</p>
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
                <User size={20} className="text-slate-400" />
                {customerName}
              </div>
              {customerEmail && <p className="text-slate-500 mt-1 pl-7 text-sm">{customerEmail}</p>}
            </div>
            <div className="text-left md:text-right">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Receipt Number</p>
              <div className="flex items-center gap-2 md:justify-end text-slate-900 font-bold text-xl font-mono">
                <FileText size={20} className="text-slate-400" />
                {transaction.receipt_entry_number || transaction.refId || 'N/A'}
              </div>
            </div>
          </div>

          {/* Core Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-slate-100 border-b border-slate-100">
            <div className="p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Date</p>
              <div className="flex items-center gap-2 text-slate-900 font-medium text-sm">
                <Calendar size={14} className="text-slate-400" />
                {format(new Date(transaction.timestamp), 'dd MMM, yyyy')}
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Amount Received</p>
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-lg">
                <Wallet size={16} />
                ₹{Number(transaction.credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Payment Mode</p>
              <Badge
                label={modeLabel}
                color={
                  paymentMode === 'CASH' ? 'bg-amber-100 text-amber-800' :
                  paymentMode === 'UPI' ? 'bg-purple-100 text-purple-800' :
                  paymentMode === 'BANK_TRANSFER' ? 'bg-blue-100 text-blue-800' :
                  'bg-slate-100 text-slate-700'
                }
              />
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Reference Number</p>
              <p className="text-slate-900 font-medium text-sm font-mono">{transaction.paymentId || '—'}</p>
            </div>
          </div>

          {/* Payment-mode specific fields */}
          {(transaction.cash_ledger || transaction.upi_app || transaction.bank_ledger || transaction.bank_name || transaction.utr) && (
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Payment Details</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">

                {paymentMode === 'CASH' && transaction.cash_ledger && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Cash Ledger</p>
                    <div className="flex items-center gap-2 text-slate-800 font-medium text-sm">
                      <Wallet size={14} className="text-slate-400" />
                      {transaction.cash_ledger}
                    </div>
                  </div>
                )}

                {paymentMode === 'UPI' && (
                  <>
                    {transaction.upi_app && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">UPI App</p>
                        <div className="flex items-center gap-2 text-slate-800 font-medium text-sm">
                          <Smartphone size={14} className="text-slate-400" />
                          {transaction.upi_app}
                        </div>
                      </div>
                    )}
                    {transaction.bank_ledger && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Bank Ledger</p>
                        <div className="flex items-center gap-2 text-slate-800 font-medium text-sm">
                          <Building2 size={14} className="text-slate-400" />
                          {transaction.bank_ledger}
                        </div>
                      </div>
                    )}
                    {transaction.utr && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">UTR / Transaction ID</p>
                        <div className="flex items-center gap-2 text-slate-800 font-medium text-sm font-mono">
                          <Hash size={14} className="text-slate-400" />
                          {transaction.utr}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {paymentMode === 'BANK_TRANSFER' && (
                  <>
                    {transaction.bank_name && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Bank Name</p>
                        <div className="flex items-center gap-2 text-slate-800 font-medium text-sm">
                          <Building2 size={14} className="text-slate-400" />
                          {transaction.bank_name}
                        </div>
                      </div>
                    )}
                    {transaction.bank_ledger && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Bank Ledger</p>
                        <div className="flex items-center gap-2 text-slate-800 font-medium text-sm">
                          <CreditCard size={14} className="text-slate-400" />
                          {transaction.bank_ledger}
                        </div>
                      </div>
                    )}
                    {transaction.utr && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">UTR Number</p>
                        <div className="flex items-center gap-2 text-slate-800 font-medium text-sm font-mono">
                          <Hash size={14} className="text-slate-400" />
                          {transaction.utr}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Remarks */}
          {transaction.remarks && (
            <div className="p-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Remarks</p>
              <p className="text-slate-700 text-sm">{transaction.remarks}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
