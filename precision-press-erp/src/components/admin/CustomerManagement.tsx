'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile } from '@/types/auth';
import { Search, Edit3, X, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

// Define expected server actions
type GetCustomersFn = () => Promise<UserProfile[]>;
type UpdateCreditLimitFn = (uid: string, limit: number) => Promise<{ success: boolean; error?: string }>;
type SyncCustomerFn = (uid: string) => Promise<{ success: boolean; error?: string }>;

export default function CustomerManagement({
  getCustomers,
  updateCustomerCreditLimit,
  syncCustomerToTally,
}: {
  getCustomers: GetCustomersFn;
  updateCustomerCreditLimit: UpdateCreditLimitFn;
  syncCustomerToTally?: SyncCustomerFn;
}) {
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CREDIT' | 'CASH'>('CREDIT');

  const [editingCredit, setEditingCredit] = useState<{ uid: string; limit: string } | null>(null);
  const [savingCredit, setSavingCredit] = useState(false);
  const [syncingCustomer, setSyncingCustomer] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (err) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Type Filter
      if (filterType !== 'ALL' && c.customerType !== filterType) {
        return false;
      }
      // Search Filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matches = [c.name, c.businessName, c.phone, c.email].some(val => 
          val?.toLowerCase().includes(search)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [customers, filterType, searchTerm]);

  const handleSaveCreditLimit = async () => {
    if (!editingCredit) return;
    
    const limit = Number(editingCredit.limit);
    if (isNaN(limit) || limit < 0) {
      toast.error('Please enter a valid positive number');
      return;
    }

    setSavingCredit(true);
    try {
      const result = await updateCustomerCreditLimit(editingCredit.uid, limit);
      if (result.success) {
        toast.success('Credit limit updated!');
        setEditingCredit(null);
        await fetchCustomers();
      } else {
        throw new Error(result.error || 'Failed to update limit');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingCredit(false);
    }
  };

  const handleSyncToTally = async (uid: string) => {
    if (!syncCustomerToTally) return;
    setSyncingCustomer(uid);
    try {
      const res = await syncCustomerToTally(uid);
      if (res.success) toast.success('Customer queued for Tally sync');
      else toast.error(res.error || 'Failed to sync to Tally');
    } catch (e: any) {
      toast.error(e.message || 'Failed to sync');
    } finally {
      setSyncingCustomer(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
      <div className="mb-6 md:mb-8 md:flex md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 md:text-3xl">Customer Management</h1>
          <p className="mt-1 text-sm text-slate-500">Manage customers and their credit limits.</p>
        </div>
        <div className="mt-4 md:mt-0">
          <Link 
            href="/admin/customers/payment-requests"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Review Payment Requests
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-full md:w-auto">
          <button 
            onClick={() => setFilterType('ALL')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-colors ${filterType === 'ALL' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilterType('CREDIT')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-colors ${filterType === 'CREDIT' ? 'bg-blue-500 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Credit
          </button>
          <button 
            onClick={() => setFilterType('CASH')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[11px] font-bold tracking-widest uppercase transition-colors ${filterType === 'CASH' ? 'bg-emerald-500 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Cash
          </button>
        </div>

        <div className="relative flex-1 md:max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, business, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-slate-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="p-4">Customer</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Type</th>
                <th className="p-4">GST Info</th>
                <th className="p-4 text-right">Credit Usage</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">Loading customers...</td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">No customers found.</td>
                </tr>
              ) : (
                filteredCustomers.map(customer => {
                  const limit = customer.creditLimit || 0;
                  const used = customer.usedCredit || 0;
                  const available = limit - used;
                  const isExceeded = used > limit;

                  return (
                    <tr key={customer.uid} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{customer.businessName || customer.name}</div>
                        <div className="text-xs text-slate-500">{customer.businessName ? customer.name : ''}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-slate-900">{customer.phone || '-'}</div>
                        <div className="text-xs text-slate-500">{customer.email}</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                          customer.customerType === 'CREDIT' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {customer.customerType || 'CASH'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-xs font-medium text-slate-700">{customer.gstType}</div>
                        {customer.gstNumber && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs font-mono text-slate-500">{customer.gstNumber}</span>
                            {customer.gstVerified && <ShieldCheck size={12} className="text-emerald-500" />}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {customer.customerType === 'CREDIT' ? (
                           <div>
                             <div className="font-bold text-slate-900">₹{limit.toLocaleString()} Limit</div>
                             <div className={`text-xs ${isExceeded ? 'text-red-500 font-bold flex items-center justify-end gap-1' : 'text-slate-500'}`}>
                               {isExceeded && <AlertTriangle size={10} />}
                               ₹{used.toLocaleString()} Used
                             </div>
                           </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingCredit({ uid: customer.uid, limit: String(customer.creditLimit || 0) })}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 size={12} />
                            Limit
                          </button>
                          {syncCustomerToTally && (
                            <button
                              onClick={() => handleSyncToTally(customer.uid)}
                              disabled={syncingCustomer === customer.uid}
                              className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-green-700 hover:bg-green-100 disabled:opacity-50"
                            >
                              <Check size={12} className={syncingCustomer === customer.uid ? "animate-pulse" : ""} />
                              {syncingCustomer === customer.uid ? 'Syncing...' : 'Tally'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Credit Modal */}
      {editingCredit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">Set Credit Limit</h3>
              <button onClick={() => setEditingCredit(null)} className="text-slate-400 hover:text-slate-900"><X size={20} /></button>
            </div>
            
            <div className="mb-6">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Max Credit Limit (₹)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                <input 
                  type="number" 
                  autoFocus
                  value={editingCredit.limit} 
                  onChange={(e) => setEditingCredit(prev => prev ? { ...prev, limit: e.target.value } : null)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-4 text-lg font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" 
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                If the customer's outstanding balance exceeds this limit, they will not be able to place new orders on credit.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditingCredit(null)} className="flex-1 h-11 rounded-xl bg-slate-100 text-[11px] font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-200">
                Cancel
              </button>
              <button onClick={handleSaveCreditLimit} disabled={savingCredit} className="flex-1 h-11 rounded-xl bg-blue-600 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-blue-700 disabled:opacity-50">
                {savingCredit ? 'Saving...' : 'Save Limit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
