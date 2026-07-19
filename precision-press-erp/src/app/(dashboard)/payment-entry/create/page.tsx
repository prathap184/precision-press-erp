'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Search, Wallet, Save, X, Plus, Trash2, Building2, Hash, Smartphone, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { getSupplierLedgerSummaries } from '@/lib/actions/suppliers';
import { createPaymentEntry } from '@/lib/actions/accounts';
import { supabase } from '@/lib/supabase';
import { UserProfile } from '@/types/auth';

type AllocationType = 'Agst Ref' | 'Advance' | 'On Account' | string;

type AllocationRow = {
  id: string;
  type: AllocationType;
  orderId?: string;
  orderRef?: string;
  amountAllocated: number;
  maxAmount?: number;
};

const PAYMENT_CATEGORIES = [
  'Supplier', 'Expense', 'Employee', 'Customer Refund', 
  'Advance Payment', 'Asset Purchase', 'Tax Payment', 'Other'
];
const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
];

const UPI_APPS = ['PhonePe', 'GPay', 'Paytm', 'BHIM', 'Amazon Pay', 'Other'];

export default function PaymentEntryPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<UserProfile[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  // Payment Category
  const [paymentCategory, setPaymentCategory] = useState('Supplier');

  // Supplier Dropdown
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  // Bill-wise rows
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Payment Mode + fields
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [refNumber, setRefNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  // Mode-specific fields
  const [cashLedger, setCashLedger] = useState('Cash');
  const [upiApp, setUpiApp] = useState('');
  const [bankLedger, setBankLedger] = useState('');
  const [bankName, setBankName] = useState('');
  const [utr, setUtr] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Bank Accounts for dropdown
  const [bankAccountsList, setBankAccountsList] = useState<string[]>([]);

  useEffect(() => {
    getSupplierLedgerSummaries().then(data => {
      setSuppliers(data as any);
      setLoadingSuppliers(false);
    }).catch(() => {
      toast.error('Failed to load suppliers');
      setLoadingSuppliers(false);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target as Node)) {
        setIsSupplierDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    // Fetch bank accounts for the dropdown
    supabase.from('bankAccounts').select('label').then(({ data }) => {
      if (data) {
        const labels = data.map(d => d.label).filter(Boolean) as string[];
        setBankAccountsList(labels);
        if (labels.length > 0 && !bankLedger) {
          setBankLedger(labels[0]);
        }
      }
    });

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch pending orders when supplier selected
  useEffect(() => {
    if (!selectedSupplierId) {
      setPendingOrders([]);
      setAllocations([]);
      return;
    }
    setLoadingOrders(true);
    supabase
      .from('orders')
      .select('id, productName, grand_total_snapshot, amount_paid, sale_entry_number')
      .eq('supplierId', selectedSupplierId)
      .eq('sale_created', true)
      .eq('payment_created', false)
      .order('createdAt', { ascending: false })
      .then(({ data }) => {
        const orders = (data || []).map(o => ({
          ...o,
          balance: Number(o.grand_total_snapshot || 0) - Number(o.amount_paid || 0)
        })).filter(o => o.balance > 0);
        setPendingOrders(orders);
        // auto-add first row
        setAllocations([{
          id: Date.now().toString(),
          type: orders.length > 0 ? 'Agst Ref' : 'Advance',
          amountAllocated: 0
        }]);
      })
      .finally(() => setLoadingOrders(false));
  }, [selectedSupplierId]);

  useEffect(() => {
    if (paymentCategory !== 'Supplier') {
      setSelectedSupplierId('');
      setAllocations([{
        id: Date.now().toString(),
        type: paymentCategory,
        orderRef: '',
        amountAllocated: 0
      }]);
    } else {
      setAllocations([]);
    }
  }, [paymentCategory]);

  const filteredSuppliers = suppliers.filter(s =>
    (s.displayName || s.name || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone || '').includes(supplierSearch)
  ).slice(0, 20);

  const selectedSupplier = suppliers.find(s => s.uid === selectedSupplierId);
  const totalDebit = allocations.reduce((sum, r) => sum + (Number(r.amountAllocated) || 0), 0);

  const addAllocationRow = () => {
    setAllocations(prev => [...prev, {
      id: Date.now().toString(),
      type: paymentCategory === 'Supplier' ? 'Agst Ref' : paymentCategory,
      orderRef: '',
      amountAllocated: 0
    }]);
  };

  const updateAllocation = (id: string, field: keyof AllocationRow, value: any) => {
    setAllocations(prev => prev.map(row => {
      if (row.id !== id) return row;
      const newRow = { ...row, [field]: value };

      if (field === 'orderId' && value) {
        const order = pendingOrders.find(o => o.id === value);
        if (order) {
          newRow.orderRef = `${order.sale_entry_number || order.id} (${order.productName})`;
          newRow.maxAmount = order.balance;
          newRow.amountAllocated = order.balance;
        }
      }
      if (field === 'type' && value !== 'Agst Ref') {
        newRow.orderId = undefined;
        newRow.orderRef = undefined;
        newRow.maxAmount = undefined;
        newRow.amountAllocated = 0;
      }
      if (field === 'type' && value === 'Agst Ref') {
        newRow.amountAllocated = 0;
      }
      return newRow;
    }));
  };

  const removeAllocation = (id: string) => {
    setAllocations(prev => prev.filter(r => r.id !== id));
  };

  // Derive "To" account label from payment mode
  const toAccountLabel = () => {
    if (paymentMode === 'CASH') return cashLedger || 'Cash';
    if (paymentMode === 'UPI') return bankLedger || 'Bank (UPI)';
    if (paymentMode === 'BANK_TRANSFER') return bankLedger || bankName || 'Bank Account';
    if (paymentMode === 'CHEQUE') return bankLedger || 'Bank Account';
    return '—';
  };

  const handleSubmit = async () => {
    if (paymentCategory === 'Supplier' && !selectedSupplierId) return toast.error('Select a supplier');
    if (totalDebit <= 0) return toast.error('Add at least one bill-wise row with an amount');

    setSubmitting(true);
    try {
      const allocationSummaries = allocations.map(a => {
        if (a.type === 'Agst Ref') return a.orderRef || a.orderId || 'Agst Ref';
        return a.type;
      }).filter(Boolean).join(', ');

      const combinedRemarks = remarks
        ? `${allocationSummaries} | Notes: ${remarks}`
        : allocationSummaries;

      const dbAllocations = paymentCategory === 'Supplier'
        ? allocations
            .filter(a => a.type === 'Agst Ref' && a.orderId && a.amountAllocated > 0)
            .map(a => ({ orderId: a.orderId as string, amount: Number(a.amountAllocated) }))
        : allocations.map(a => ({ category: paymentCategory, details: a.orderRef || '', amount: Number(a.amountAllocated) }));

      const res = await createPaymentEntry(
        paymentCategory === 'Supplier' ? selectedSupplierId : '',
        dbAllocations,
        totalDebit,
        paymentMode,
        refNumber,
        combinedRemarks,
        paymentCategory === 'Supplier' ? dbAllocations.map(a => (a as any).orderId).join(', ') : '',
        paymentDate,
        cashLedger,
        upiApp,
        bankLedger,
        bankLedger,
        utr,
        paymentCategory,
        ''
      );

      toast.success(`Payment Created: ${res.paymentEntryNumber}`);
      router.push('/payment-register');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="bg-slate-50 min-h-screen pb-16">

        {/* Top Nav */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="text-emerald-500" size={20} />
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Payment Voucher</h1>
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
                disabled={submitting || (paymentCategory === 'Supplier' && !selectedSupplierId) || totalDebit <= 0}
                className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors flex items-center gap-2 shadow-sm"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {submitting ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">

          {/* ── SECTION 1: Particulars ─────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Step 1 — Particulars</p>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Payment Category <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentCategory}
                onChange={e => setPaymentCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
              >
                {PAYMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {paymentCategory === 'Supplier' && (
              <div ref={supplierDropdownRef} className="relative">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Supplier <span className="text-red-500">*</span>
                </label>
              <div
                className={`flex items-center justify-between w-full px-3 py-2.5 bg-white border rounded-lg cursor-pointer transition-all shadow-sm ${isSupplierDropdownOpen ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-300 hover:border-slate-400'}`}
                onClick={() => setIsSupplierDropdownOpen(p => !p)}
              >
                <span className={selectedSupplier ? 'text-slate-900 font-medium text-sm' : 'text-slate-400 text-sm'}>
                  {selectedSupplier ? (selectedSupplier.displayName || selectedSupplier.name) : 'Search and select supplier...'}
                </span>
                <div className="flex items-center gap-2">
                  {selectedSupplierId && (
                    <button onClick={e => { e.stopPropagation(); setSelectedSupplierId(''); setSupplierSearch(''); setAllocations([]); }}
                      className="p-0.5 text-slate-400 hover:text-red-500 rounded transition-colors">
                      <X size={14} />
                    </button>
                  )}
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${isSupplierDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {isSupplierDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-md">
                      <Search size={14} className="text-slate-400" />
                      <input
                        type="text"
                        value={supplierSearch}
                        onChange={e => setSupplierSearch(e.target.value)}
                        placeholder="Search supplier..."
                        className="flex-1 bg-transparent text-sm outline-none text-slate-800 placeholder-slate-400"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {loadingSuppliers ? (
                      <div className="flex items-center justify-center py-6"><Loader2 className="animate-spin text-emerald-500" size={20} /></div>
                    ) : filteredSuppliers.length === 0 ? (
                      <div className="py-6 text-center text-sm text-slate-400">No suppliers found</div>
                    ) : filteredSuppliers.map(s => (
                      <div
                        key={s.uid}
                        onClick={() => { setSelectedSupplierId(s.uid); setSupplierSearch(''); setIsSupplierDropdownOpen(false); }}
                        className={`px-4 py-2.5 hover:bg-emerald-50 cursor-pointer transition-colors text-sm ${selectedSupplierId === s.uid ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-700'}`}
                      >
                        <div className="font-medium">{s.displayName || s.name}</div>
                        {s.phone && <div className="text-xs text-slate-400">{s.phone}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>

          {/* ── SECTION 2: Bill-wise Details or Expense Rows ─────────────────────────────── */}
          {(paymentCategory !== 'Supplier' || selectedSupplierId) && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Step 2 — {paymentCategory === 'Supplier' ? 'Bill-wise Details' : `${paymentCategory} Details`}
                </p>
                {loadingOrders && <Loader2 className="animate-spin text-slate-400" size={14} />}
              </div>

              {/* Tally-style table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="w-10 px-4 py-2 text-center text-slate-400 font-medium">#</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                    {paymentCategory === 'Supplier' ? (
                      <>
                        <th className="px-4 py-2 text-left font-medium text-slate-600">Ref / Order ID</th>
                        <th className="px-4 py-2 text-right font-medium text-slate-600">Bill Amount</th>
                      </>
                    ) : (
                      <th className="px-4 py-2 text-left font-medium text-slate-600">Details / Narration</th>
                    )}
                    <th className="px-4 py-2 text-right font-medium text-slate-600">Amount Paid</th>
                    <th className="w-10 px-4 py-2 text-center text-slate-400 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((row, idx) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-1 text-center text-xs text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-1 align-top">
                        {paymentCategory === 'Supplier' ? (
                          <select
                            value={row.type}
                            onChange={(e) => updateAllocation(row.id, 'type', e.target.value)}
                            className="w-full px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded text-slate-700 outline-none transition-colors"
                          >
                            <option value="Agst Ref">Agst Ref</option>
                            <option value="Advance">Advance</option>
                            <option value="On Account">On Account</option>
                          </select>
                        ) : (
                          <div className="w-full px-2 py-1.5 text-slate-700">{row.type}</div>
                        )}
                      </td>

                      {paymentCategory === 'Supplier' ? (
                        <>
                          <td className="px-4 py-1 align-top">
                            {row.type === 'Agst Ref' ? (
                              <select
                                value={row.orderId || ''}
                                onChange={(e) => updateAllocation(row.id, 'orderId', e.target.value)}
                                className="w-full px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded text-slate-700 outline-none transition-colors"
                              >
                                <option value="">Select Bill...</option>
                                {pendingOrders.map(o => (
                                  <option key={o.id} value={o.id} disabled={allocations.some(a => a.orderId === o.id && a.id !== row.id)}>
                                    {o.sale_entry_number || o.id} - {o.productName} (Bal: ₹{Number(o.balance).toLocaleString('en-IN')})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={row.orderRef || ''}
                                onChange={(e) => updateAllocation(row.id, 'orderRef', e.target.value)}
                                placeholder="Optional ref"
                                className="w-full px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded text-slate-700 outline-none transition-colors"
                              />
                            )}
                          </td>
                          <td className="px-4 py-1 align-top text-right">
                            <span className="inline-block py-1.5 text-slate-500 font-mono">
                              {row.maxAmount ? `₹${row.maxAmount.toLocaleString('en-IN')}` : '—'}
                            </span>
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-1 align-top">
                          <input
                            type="text"
                            value={row.orderRef || ''}
                            onChange={(e) => updateAllocation(row.id, 'orderRef', e.target.value)}
                            placeholder={`Description for ${paymentCategory}`}
                            className="w-full px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded text-slate-700 outline-none transition-colors"
                          />
                        </td>
                      )}

                      <td className="px-4 py-1 align-top">
                        <input
                          type="number"
                          value={row.amountAllocated || ''}
                          onChange={e => updateAllocation(row.id, 'amountAllocated', parseFloat(e.target.value) || 0)}
                          className="w-full text-right px-2 py-1.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded text-slate-700 outline-none transition-colors"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-2 py-1 align-top text-center">
                        {allocations.length > 1 && (
                          <button onClick={() => removeAllocation(row.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={paymentCategory === 'Supplier' ? 5 : 4} className="px-4 py-2">
                      <button
                        onClick={addAllocationRow}
                        className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                      >
                        <Plus size={13} /> Add Row
                      </button>
                    </td>
                  </tr>
                  <tr className="bg-slate-50/50">
                    <td colSpan={paymentCategory === 'Supplier' ? 4 : 3} className="px-4 py-2 text-right font-bold text-slate-700">Total:</td>
                    <td className="px-4 py-2 text-right font-bold text-emerald-600 font-mono">₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── SECTION 3: Account / Payment Mode ───────────────── */}
          {selectedSupplierId && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Step 3 — Account Details</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Payment Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                  />
                </div>

                {/* Payment Mode */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Mode <span className="text-red-500">*</span></label>
                  <select
                    value={paymentMode}
                    onChange={e => { setPaymentMode(e.target.value); setUpiApp(''); setBankLedger(''); setUtr(''); }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                  >
                    {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              {/* ── Cash fields */}
              {paymentMode === 'CASH' && (
                <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cash Ledger</label>
                    <input
                      type="text"
                      value={cashLedger}
                      onChange={e => setCashLedger(e.target.value)}
                      placeholder="e.g. Cash"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                    />
                  </div>
                </div>
              )}

              {/* ── UPI fields */}
              {paymentMode === 'UPI' && (
                <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">UPI App</label>
                    <select
                      value={upiApp}
                      onChange={e => setUpiApp(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                    >
                      <option value="">Select UPI App</option>
                      {UPI_APPS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Select Bank</label>
                    <select
                      value={bankLedger}
                      onChange={e => setBankLedger(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                    >
                      {bankAccountsList.length === 0 && <option value="">No banks found</option>}
                      {bankAccountsList.map(bank => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">UTR / Transaction ID</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                      <input
                        type="text"
                        value={utr}
                        onChange={e => setUtr(e.target.value)}
                        placeholder="Enter UTR"
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Bank Transfer / Cheque fields */}
              {(paymentMode === 'BANK_TRANSFER' || paymentMode === 'CHEQUE') && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Select Bank</label>
                    <select
                      value={bankLedger}
                      onChange={e => setBankLedger(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                    >
                      {bankAccountsList.length === 0 && <option value="">No banks found</option>}
                      {bankAccountsList.map(bank => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">UTR / {paymentMode === 'CHEQUE' ? 'Cheque No' : 'Transaction ID'}</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                      <input
                        type="text"
                        value={utr}
                        onChange={e => setUtr(e.target.value)}
                        placeholder={paymentMode === 'CHEQUE' ? 'Cheque number' : 'Enter UTR'}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Ref + Narration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Reference Number</label>
                  <input
                    type="text"
                    value={refNumber}
                    onChange={e => setRefNumber(e.target.value)}
                    placeholder="Txn ID, Cheque No, etc."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Narration / Remarks</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Optional notes or references"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </RoleGuard>
  );
}
