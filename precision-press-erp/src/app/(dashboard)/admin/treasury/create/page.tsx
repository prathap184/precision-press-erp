'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Building, Banknote, ArrowRight, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { createContraEntry } from '@/lib/actions/accounts';
import { fetchLiveBalances } from '@/lib/actions/tally-masters';

export default function TreasuryContraPage() {
  const router = useRouter();
  
  const [transferType, setTransferType] = useState<'CASH_TO_BANK' | 'BANK_TO_CASH'>('CASH_TO_BANK');
  const [amount, setAmount] = useState<string>('');
  const [contraDate, setContraDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Live Balances
  const [fetchingBalances, setFetchingBalances] = useState(false);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const fetchInternalBalances = async () => {
    setFetchingBalances(true);
    setSyncStatus('Fetching internal balances...');
    try {
      const { data: cashData } = await supabase
        .from('company_cash_ledger')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: bankData } = await supabase
        .from('company_bank_ledger')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1);

      if (cashData && cashData.length > 0) {
        setCashBalance(cashData[0].balance_after);
      } else {
        setCashBalance(0);
      }
      
      if (bankData && bankData.length > 0) {
        setBankBalance(bankData[0].balance_after);
      } else {
        setBankBalance(0);
      }
      
      setSyncStatus('Internal balances loaded.');
    } catch (err: any) {
      setSyncStatus(`Error: ${err.message}`);
    } finally {
      setFetchingBalances(false);
    }
  };

  useEffect(() => {
    fetchInternalBalances();
  }, []);

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) return toast.error('Enter valid amount');

    setSubmitting(true);
    try {
      const res = await createContraEntry(
        transferType,
        Number(amount), 
        remarks,
        contraDate
      );
      toast.success(`Contra Created: ${res.contraEntryNumber}`);
      
      setAmount('');
      setRemarks('');
      // Optionally re-fetch balances here
    } catch (err: any) {
      toast.error(err.message || 'Failed to create contra entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="bg-slate-50 min-h-screen pb-12 relative">
        
        {/* Header */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building className="text-blue-600" size={20} />
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Treasury (Contra Voucher)</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !amount}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors flex items-center gap-2 shadow-sm"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {submitting ? 'Saving...' : 'Save Contra'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-6 mt-6 animate-in fade-in duration-500 space-y-6">
          
          {/* Live Balances Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Current Balances</h2>
                <p className="text-xs text-slate-500">Live data from internal ledger</p>
              </div>
              <div>
                <button 
                  onClick={fetchInternalBalances}
                  disabled={fetchingBalances}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 text-xs font-bold rounded-md shadow disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {fetchingBalances && <Loader2 className="animate-spin" size={14}/>}
                  Refresh Balances
                </button>
                {syncStatus && <p className="text-[10px] text-slate-500 mt-1 text-right">{syncStatus}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded border border-emerald-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Banknote size={16} className="text-emerald-600"/>
                  <span className="text-sm font-bold text-emerald-800">Cash in Hand</span>
                </div>
                <div className="text-2xl font-black text-emerald-700 font-mono">
                  {cashBalance !== null ? `₹${cashBalance.toLocaleString()}` : '--'}
                </div>
              </div>
              <div className="bg-blue-50 rounded border border-blue-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building size={16} className="text-blue-600"/>
                  <span className="text-sm font-bold text-blue-800">Bank Balance</span>
                </div>
                <div className="text-2xl font-black text-blue-700 font-mono">
                  {bankBalance !== null ? `₹${bankBalance.toLocaleString()}` : '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                Internal Transfer
              </h2>
              <p className="text-xs text-slate-500">Record cash deposited to bank or cash withdrawn from bank.</p>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Transfer Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-3">Transfer Type <span className="text-red-500">*</span></label>
                <div className="flex gap-4">
                  <label className={`flex-1 flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all ${transferType === 'CASH_TO_BANK' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="ttype" className="sr-only" checked={transferType === 'CASH_TO_BANK'} onChange={() => setTransferType('CASH_TO_BANK')} />
                    <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                      <span>Cash</span> <ArrowRight size={16} className="text-slate-400"/> <span className="text-blue-600">Bank</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Deposit</div>
                  </label>
                  <label className={`flex-1 flex flex-col items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-all ${transferType === 'BANK_TO_CASH' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="ttype" className="sr-only" checked={transferType === 'BANK_TO_CASH'} onChange={() => setTransferType('BANK_TO_CASH')} />
                    <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
                      <span className="text-blue-600">Bank</span> <ArrowRight size={16} className="text-slate-400"/> <span>Cash</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Withdrawal</div>
                  </label>
                </div>
              </div>

              {/* Contra Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contra Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={contraDate}
                  onChange={e => setContraDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                />
              </div>
              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Amount <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-bold">₹</span>
                  <input 
                    type="number" 
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-md text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks</label>
                <input 
                  type="text" 
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Denominations, specific branch, etc."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm"
                />
              </div>

            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
