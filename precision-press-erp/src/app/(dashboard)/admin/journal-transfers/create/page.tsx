'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ArrowRightLeft, Save, X, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { getCustomers } from '@/lib/actions/users';
import { createJournalEntry } from '@/lib/actions/accounts';
import { fetchLiveBalances } from '@/lib/actions/tally-masters';
import { UserProfile } from '@/types/auth';

export default function JournalTransferPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // From Customer
  const [fromSearch, setFromSearch] = useState('');
  const [isFromOpen, setIsFromOpen] = useState(false);
  const fromRef = useRef<HTMLDivElement>(null);
  const [fromId, setFromId] = useState('');

  // To Customer
  const [toSearch, setToSearch] = useState('');
  const [isOpen, setIsToOpen] = useState(false);
  const toRef = useRef<HTMLDivElement>(null);
  const [toId, setToId] = useState('');
  
  // Form State
  const [amount, setAmount] = useState<string>('');
  const [journalDate, setJournalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [orderId, setOrderId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Live Balances
  const [fetchingBalances, setFetchingBalances] = useState(false);
  const [fromBalance, setFromBalance] = useState<number | null>(null);
  const [toBalance, setToBalance] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleFetchBalances = async () => {
    if (!fromId && !toId) {
      toast.error('Please select at least one customer first');
      return;
    }
    setFetchingBalances(true);
    setSyncStatus('Fetching from Tally...');
    try {
      const res = await fetchLiveBalances('SYSTEM');
      if (res.success && res.data) {
        const ledgers = res.data?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER || [];
        const ledgerArray = Array.isArray(ledgers) ? ledgers : [ledgers];

        const parseBalance = (closingBal: string | number) => {
          if (typeof closingBal === 'string') {
             const num = parseFloat(closingBal.replace(/[^\d.-]/g, ''));
             return closingBal.includes('Dr') ? num : -num; 
          }
          return Number(closingBal) || 0;
        };

        if (fromId) {
          const fromCustomer = customers.find(c => c.uid === fromId);
          const fromLedgerName = (fromCustomer as any)?.tally_ledger_name || fromCustomer?.displayName || fromCustomer?.name;
          const ledger = ledgerArray.find((l: any) => l.NAME?.toLowerCase() === fromLedgerName?.toLowerCase());
          if (ledger) setFromBalance(parseBalance(ledger.CLOSINGBALANCE));
        }

        if (toId) {
          const toCustomer = customers.find(c => c.uid === toId);
          const toLedgerName = (toCustomer as any)?.tally_ledger_name || toCustomer?.displayName || toCustomer?.name;
          const ledger = ledgerArray.find((l: any) => l.NAME?.toLowerCase() === toLedgerName?.toLowerCase());
          if (ledger) setToBalance(parseBalance(ledger.CLOSINGBALANCE));
        }

        setSyncStatus('Successfully synced live balances.');
      } else {
        setSyncStatus(`Sync Failed: ${res.error}`);
      }
    } catch (err: any) {
      setSyncStatus(`Error: ${err.message}`);
    } finally {
      setFetchingBalances(false);
    }
  };

  useEffect(() => {
    getCustomers().then(data => {
      setCustomers(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      toast.error('Failed to load customers');
      setLoading(false);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (fromRef.current && !fromRef.current.contains(event.target as Node)) setIsFromOpen(false);
      if (toRef.current && !toRef.current.contains(event.target as Node)) setIsToOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredFrom = customers.filter(c => 
    (c.displayName || c.name || '').toLowerCase().includes(fromSearch.toLowerCase()) && c.uid !== toId
  ).slice(0, 20);

  const filteredTo = customers.filter(c => 
    (c.displayName || c.name || '').toLowerCase().includes(toSearch.toLowerCase()) && c.uid !== fromId
  ).slice(0, 20);

  const selectedFrom = customers.find(c => c.uid === fromId);
  const selectedTo = customers.find(c => c.uid === toId);

  const handleSubmit = async () => {
    if (!fromId) return toast.error('Select source customer');
    if (!toId) return toast.error('Select target customer');
    if (!amount || Number(amount) <= 0) return toast.error('Enter valid amount');

    setSubmitting(true);
    try {
      const res = await createJournalEntry(
        fromId, 
        toId,
        Number(amount), 
        remarks,
        journalDate,
        orderId
      );
      toast.success(`Journal Created: ${res.journalEntryNumber}`);
      
      setAmount('');
      setRemarks('');
      setFromId('');
      setToId('');
      setFromSearch('');
      setToSearch('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create journal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="bg-slate-50 min-h-screen pb-12 relative">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="text-violet-500" size={20} />
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Journal Voucher (Transfers)</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleFetchBalances}
                disabled={fetchingBalances || (!fromId && !toId)}
                className="px-3 py-1.5 text-xs font-bold text-violet-700 bg-violet-100 hover:bg-violet-200 rounded-md transition-colors disabled:opacity-50"
              >
                {fetchingBalances ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                Fetch Live Balances
              </button>
              <button
                onClick={() => router.back()}
                className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !amount || !fromId || !toId}
                className="px-4 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-md transition-colors flex items-center gap-2 shadow-sm"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {submitting ? 'Saving...' : 'Save Journal'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-6 mt-6 animate-in fade-in duration-500 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            
            <div className="p-6 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                Customer Balance Transfer
              </h2>
              <p className="text-xs text-slate-500">Transfer credit balance from one customer to another.</p>
            </div>

            {syncStatus && (
              <div className={`m-6 p-3 rounded-lg text-xs font-medium ${
                syncStatus.includes('Failed') || syncStatus.includes('Error') 
                  ? 'bg-red-50 text-red-700' 
                  : 'bg-emerald-50 text-emerald-700'
              }`}>
                {syncStatus}
              </div>
            )}

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Source (Debit) */}
              <div className="relative" ref={fromRef}>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                  <UserMinus size={14} className="text-red-500"/> From Customer (Debit) <span className="text-red-500">*</span>
                </label>
                
                <div className="relative w-full cursor-pointer" onClick={() => setIsFromOpen(true)}>
                  <input 
                    type="text" 
                    placeholder="Search source customer..."
                    value={isFromOpen ? fromSearch : (selectedFrom?.displayName || selectedFrom?.name || selectedFrom?.phone || '')}
                    onChange={e => {
                      setFromSearch(e.target.value);
                      if (!isFromOpen) setIsFromOpen(true);
                    }}
                    className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-300 rounded-md text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                  />
                  {!isFromOpen && selectedFrom && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setFromId(''); setFromSearch(''); setFromBalance(null); }}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {selectedFrom && (
                  <div className="mt-4 p-3 bg-violet-50 rounded-xl border border-violet-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-violet-600 font-bold shadow-sm">
                        {selectedFrom.displayName?.charAt(0) || selectedFrom.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{selectedFrom.displayName || selectedFrom.name}</p>
                        <p className="text-xs text-slate-500">{selectedFrom.phone || selectedFrom.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 font-medium">Tally Balance</p>
                      <p className={`text-sm font-bold ${fromBalance !== null ? (fromBalance > 0 ? 'text-emerald-600' : fromBalance < 0 ? 'text-red-600' : 'text-slate-700') : 'text-slate-400'}`}>
                        {fromBalance !== null ? `₹${Math.abs(fromBalance).toLocaleString('en-IN')}` : '--'}
                        {fromBalance !== null && fromBalance !== 0 && (fromBalance > 0 ? ' Dr' : ' Cr')}
                      </p>
                    </div>
                  </div>
                )}

                {isFromOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                    {loading ? (
                      <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
                    ) : filteredFrom.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500 text-center">No customers found.</div>
                    ) : (
                      filteredFrom.map(c => (
                        <div 
                          key={c.uid}
                          onClick={() => {
                            setFromId(c.uid);
                            setFromSearch('');
                            setIsFromOpen(false);
                            setFromBalance(null);
                          }}
                          className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                        >
                          <div className="font-medium text-slate-800 text-sm">{c.displayName || c.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{c.phone || c.email}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Target (Credit) */}
              <div className="relative" ref={toRef}>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                  <UserPlus size={14} className="text-emerald-500"/> To Customer (Credit) <span className="text-red-500">*</span>
                </label>
                
                <div className="relative w-full cursor-pointer" onClick={() => setIsToOpen(true)}>
                  <input 
                    type="text" 
                    placeholder="Search target customer..."
                    value={isOpen ? toSearch : (selectedTo?.displayName || selectedTo?.name || selectedTo?.phone || '')}
                    onChange={e => {
                      setToSearch(e.target.value);
                      if (!isOpen) setIsToOpen(true);
                    }}
                    className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-300 rounded-md text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                  />
                  {!isOpen && selectedTo && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setToId(''); setToSearch(''); }}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                    {loading ? (
                      <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
                    ) : filteredTo.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500 text-center">No customers found.</div>
                    ) : (
                      filteredTo.map(c => (
                        <div 
                          key={c.uid}
                          onClick={() => {
                            setToId(c.uid);
                            setToSearch('');
                            setIsToOpen(false);
                          }}
                          className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0"
                        >
                          <div className="font-medium text-slate-800 text-sm">{c.displayName || c.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{c.phone || c.email}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Amount, Date, Order ID */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Amount <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Journal Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={journalDate}
                    onChange={e => setJournalDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ref Order ID</label>
                  <input
                    type="text"
                    value={orderId}
                    onChange={e => setOrderId(e.target.value)}
                    placeholder="Optional Order ID"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks</label>
                <input 
                  type="text" 
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Reason for transfer..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all shadow-sm"
                />
              </div>

            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
