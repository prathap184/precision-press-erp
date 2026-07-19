'use client';

import React, { useState } from 'react';
import { fetchLiveBalances } from '@/lib/actions/tally-masters';

export function SupplierListClient({ initialSuppliers }: { initialSuppliers: any[] }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleLiveSync = async () => {
    setIsSyncing(true);
    setSyncStatus('Requesting live balances from Tally... Please wait.');
    try {
      // Pass a dummy user id since this is client-side, in a real app use useUser() 
      const res = await fetchLiveBalances('SYSTEM_USER');
      if (res.success && res.data) {
        // Parse trial balance JSON
        const ledgers = res.data?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER || [];
        const ledgerArray = Array.isArray(ledgers) ? ledgers : [ledgers];

        const updatedSuppliers = suppliers.map(s => {
          // Find matching ledger in Tally data
          const tallyLedger = ledgerArray.find((l: any) => l.NAME === (s.tallyLedgerName || s.name));
          if (tallyLedger) {
            // Tally balances are usually string amounts with "Dr" or "Cr"
            const closingBal = tallyLedger.CLOSINGBALANCE;
            let balance = 0;
            if (typeof closingBal === 'string') {
               const num = parseFloat(closingBal.replace(/[^\d.-]/g, ''));
               // In Tally Cr is usually supplier balance (we owe them)
               balance = closingBal.includes('Dr') ? -num : num; 
            } else if (typeof closingBal === 'number') {
               balance = closingBal;
            }
            return { ...s, outstandingBalance: balance };
          }
          return s;
        });
        
        setSuppliers(updatedSuppliers);
        setSyncStatus('Successfully synced live balances from Tally.');
      } else {
        setSyncStatus(`Sync Failed: ${res.error}`);
      }
    } catch (err: any) {
      setSyncStatus(`Error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div>
          <button 
            onClick={handleLiveSync}
            disabled={isSyncing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-bold rounded-md shadow disabled:opacity-50 transition-colors"
          >
            {isSyncing ? 'Syncing...' : 'Fetch Live Balances'}
          </button>
          {syncStatus && (
            <p className="text-xs mt-2 text-slate-600 font-medium">{syncStatus}</p>
          )}
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider">Supplier Name</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider">Contact</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider">Tally Ledger</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-wider text-right">Outstanding Balance (Cr)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map(sup => (
              <tr key={sup.uid} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">{sup.name}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {sup.phone && <div>{sup.phone}</div>}
                  {sup.email && <div className="text-xs text-slate-400">{sup.email}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                  {sup.tallyLedgerName || 'Not Mapped'}
                </td>
                <td className="px-4 py-3 text-right">
                  {sup.outstandingBalance ? (
                    <span className="font-bold text-slate-900 font-mono">
                      ₹ {sup.outstandingBalance.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-sm">₹ 0.00</span>
                  )}
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No suppliers found. Check your users list and ensure roles are set to SUPPLIER.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
