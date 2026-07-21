'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Wallet, ChevronDown, Save, X, Plus, Trash2, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { getCustomers } from '@/lib/actions/users';
import { createReceiptEntry } from '@/lib/actions/accounts';
import { supabase } from '@/lib/supabase';
import { UserProfile } from '@/types/auth';

type AllocationType = 'Agst Ref' | 'Advance' | 'On Account';

type AllocationRow = {
  id: string;
  type: AllocationType;
  orderId?: string;
  orderRef?: string;
  amountAllocated: number;
  maxAmount?: number;
};

export default function ReceiptEntryPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Customer Dropdown State
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // Payment Form State
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [refNumber, setRefNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [cashLedger, setCashLedger] = useState('Cash');
  const [upiApp, setUpiApp] = useState('');
  const [bankLedger, setBankLedger] = useState('');
  const [bankName, setBankName] = useState('');
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Bank Accounts for dropdown
  const [bankAccountsList, setBankAccountsList] = useState<string[]>([]);

  // Allocations (inline, no modal)
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const hasPrefilled = useRef(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    // Read query params for pre-filling (e.g. from Proxy Order redirection)
    const initCustomerId = searchParams.get('customerId');
    const initAmount = searchParams.get('amount');
    const initMode = searchParams.get('mode')?.trim().toUpperCase();
    const initBankLedger = searchParams.get('bankLedger');
    const initUpiApp = searchParams.get('upiApp');
    const initUtr = searchParams.get('utr');
    const initRemarks = searchParams.get('remarks');

    if (initMode) {
      if (initMode === 'HAND_CASH' || initMode === 'CASH') {
        setPaymentMode('CASH');
      } else if (initMode === 'BANK' || initMode === 'BANK_TRANSFER') {
        setPaymentMode('BANK_TRANSFER');
      } else if (initMode === 'UPI') {
        setPaymentMode('UPI');
      } else {
        setPaymentMode(initMode);
      }
    }
    
    if (initBankLedger) {
      setBankLedger(initBankLedger);
      setBankName(initBankLedger);
    }
    if (initUpiApp) setUpiApp(initUpiApp);
    if (initUtr) setUtr(initUtr);
    if (initRemarks) setRemarks(initRemarks);

    if (initAmount && Number(initAmount) > 0) {
      hasPrefilled.current = true;
      setAllocations([{
        id: Date.now().toString(),
        type: 'On Account',
        amountAllocated: Number(initAmount)
      }]);
    }

    if (initCustomerId) setSelectedCustomerId(initCustomerId);

    getCustomers().then(data => {
      setCustomers(data);
      setLoadingCustomers(false);
      // Pre-fill customer search text if we have an initCustomerId
      if (initCustomerId) {
        const found = data.find(c => c.uid === initCustomerId);
        if (found) setCustomerSearch(found.displayName || found.name || found.phone || '');
      }
    }).catch(err => {
      console.error(err);
      toast.error('Failed to load customers');
      setLoadingCustomers(false);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
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

  // Fetch pending orders when customer is selected
  useEffect(() => {
    if (selectedCustomerId) {
      setLoadingOrders(true);
      supabase
        .from('orders')
        .select('id, productName, grand_total_snapshot, amount_paid, sale_entry_number')
        .eq('customerId', selectedCustomerId)
        .eq('sale_created', true)
        .eq('receipt_created', false)
        .order('sale_entry_number', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            toast.error('Error fetching orders: ' + error.message);
          } else {
            const orders = (data || []).map(o => {
              const total = Number(o.grand_total_snapshot || 0);
              const paid = Number(o.amount_paid || 0);
              return { ...o, balance: total - paid };
            }).filter(o => o.balance > 0);
            setPendingOrders(orders);
          }
        })
        .finally(() => setLoadingOrders(false));

      setAllocations(prev => {
        // If we already have a pre-filled On Account with an amount, keep it.
        if (prev.length === 1 && prev[0].type === 'On Account' && prev[0].amountAllocated > 0) {
          return prev;
        }
        return [{ id: Date.now().toString(), type: 'Agst Ref', amountAllocated: 0 }];
      });
    } else {
      setPendingOrders([]);
      setAllocations(prev => {
        // Don't wipe if we have a pre-filled advance
        if (prev.length === 1 && prev[0].type === 'On Account' && prev[0].amountAllocated > 0) {
          return prev;
        }
        return [];
      });
    }
  }, [selectedCustomerId]);

  const selectedCustomer = customers.find(c => c.uid === selectedCustomerId);
  const filteredCustomers = customers.filter(c =>
    (c.displayName || c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone || '').includes(customerSearch)
  ).slice(0, 20);

  // Total receipt amount = sum of all allocations
  const totalReceiptAmount = allocations.reduce((sum, row) => sum + (Number(row.amountAllocated) || 0), 0);

  const addAllocationRow = () => {
    setAllocations([...allocations, {
      id: Date.now().toString(),
      type: 'Agst Ref',
      amountAllocated: 0
    }]);
  };

  const updateAllocation = (id: string, field: keyof AllocationRow, value: any) => {
    setAllocations(allocations.map(row => {
      if (row.id !== id) return row;

      const newRow = { ...row, [field]: value };

      // When an invoice is selected for Agst Ref, auto-fill amount from pending balance
      if (field === 'orderId' && value) {
        const order = pendingOrders.find(o => o.id === value);
        if (order) {
          newRow.orderRef = `${order.sale_entry_number || order.id} (${order.productName})`;
          newRow.maxAmount = order.balance;
          newRow.amountAllocated = order.balance; // auto-fill full pending amount
        }
      }

      // When type changes, reset order-specific fields
      if (field === 'type') {
        if (value !== 'Agst Ref') {
          newRow.orderId = undefined;
          newRow.orderRef = undefined;
          newRow.maxAmount = undefined;
          newRow.amountAllocated = 0; // let user enter manually for Advance/On Account
        } else {
          newRow.amountAllocated = 0;
        }
      }

      return newRow;
    }));
  };

  const removeAllocation = (id: string) => {
    setAllocations(allocations.filter(row => row.id !== id));
  };

  const handleSubmit = async () => {
    if (!selectedCustomerId) return toast.error('Select a customer');
    if (allocations.length === 0) return toast.error('Add at least one allocation row');
    if (totalReceiptAmount <= 0) return toast.error('Total receipt amount must be greater than 0');

    // Validate each row
    for (const row of allocations) {
      if (row.type === 'Agst Ref' && !row.orderId) {
        return toast.error('Please select a pending invoice for all "Agst Ref" rows');
      }
      if ((row.amountAllocated || 0) <= 0) {
        return toast.error('All allocation rows must have an amount greater than 0');
      }
    }

    setSubmitting(true);
    try {
      const allocationSummaries = allocations.map(a => {
        if (a.type === 'Agst Ref') return `${a.orderRef || a.orderId}`;
        if (a.type === 'Advance') return `Advance`;
        if (a.type === 'On Account') return `On Account`;
        return '';
      }).filter(Boolean).join(', ');

      const combinedRemarks = remarks
        ? `${allocationSummaries} | Notes: ${remarks}`
        : allocationSummaries;

      const dbAllocations = allocations
        .filter(a => a.type === 'Agst Ref' && a.orderId && a.amountAllocated > 0)
        .map(a => ({ orderId: a.orderId as string, amount: Number(a.amountAllocated) }));

      const res = await createReceiptEntry(
        selectedCustomerId,
        dbAllocations,
        totalReceiptAmount,
        paymentMode,
        refNumber,
        combinedRemarks,
        dbAllocations.map(a => a.orderId).join(', '),
        cashLedger,
        upiApp,
        bankLedger,
        bankLedger, // Pass bankLedger as bankName to keep them strictly in sync
        utr
      );

      toast.success(`Receipt Created: ${res.receiptEntryNumber}`);

      // Reset form
      setPaymentMode('CASH');
      setRefNumber('');
      setRemarks('');
      setCashLedger('Cash');
      setUpiApp('');
      setBankLedger('');
      setBankName('');
      setUtr('');
      setSelectedCustomerId('');
      setCustomerSearch('');
      setAllocations([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create receipt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="bg-slate-50 min-h-screen pb-12">

        {/* Top Nav */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="text-emerald-500" size={20} />
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Receipt Voucher</h1>
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
                disabled={submitting || !selectedCustomerId || totalReceiptAmount <= 0}
                className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors flex items-center gap-2 shadow-sm"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {submitting ? 'Saving...' : 'Save Receipt'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-6 mt-6 space-y-5">

          {/* Section 1: Customer Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Particulars</h2>
            <div className="relative" ref={customerDropdownRef}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Customer <span className="text-red-500">*</span>
              </label>
              <div
                className="relative w-full cursor-pointer"
                onClick={() => setIsCustomerDropdownOpen(true)}
              >
                <input
                  type="text"
                  placeholder="Search customer..."
                  value={isCustomerDropdownOpen ? customerSearch : (selectedCustomer?.displayName || selectedCustomer?.name || selectedCustomer?.phone || '')}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    if (!isCustomerDropdownOpen) setIsCustomerDropdownOpen(true);
                  }}
                  className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                />
                {!isCustomerDropdownOpen && selectedCustomerId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedCustomerId(''); setCustomerSearch(''); setAllocations([]); }}
                    className="absolute right-8 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                )}
                <ChevronDown className="absolute right-3 top-3 text-slate-400" size={16} />
              </div>
              {isCustomerDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {loadingCustomers ? (
                    <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500 text-center">No customers found.</div>
                  ) : (
                    filteredCustomers.map(c => (
                      <div
                        key={c.uid}
                        onClick={() => {
                          setSelectedCustomerId(c.uid);
                          setCustomerSearch('');
                          setIsCustomerDropdownOpen(false);
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
          </div>

          {/* Section 2: Bill-wise Allocation (inline) */}
          {selectedCustomerId ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Bill-wise Details</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedCustomer?.displayName || selectedCustomer?.name}
                    {loadingOrders && <span className="ml-2 text-emerald-500 inline-flex items-center gap-1"><Loader2 className="animate-spin" size={11} /> Loading invoices...</span>}
                  </p>
                </div>
                {pendingOrders.length === 0 && !loadingOrders && (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">No pending invoices</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-xs text-slate-500 uppercase tracking-wide w-[180px]">Type of Ref</th>
                      <th className="px-5 py-3 font-semibold text-xs text-slate-500 uppercase tracking-wide">Name / Pending Invoice</th>
                      <th className="px-5 py-3 font-semibold text-xs text-slate-500 uppercase tracking-wide text-right w-[160px]">Amount (₹)</th>
                      <th className="px-3 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allocations.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 align-top">
                          <select
                            value={row.type}
                            onChange={(e) => updateAllocation(row.id, 'type', e.target.value as AllocationType)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 outline-none font-medium text-slate-800"
                          >
                            <option value="Agst Ref">Agst Ref</option>
                            <option value="Advance">Advance</option>
                            <option value="On Account">On Account</option>
                          </select>
                        </td>
                        <td className="px-5 py-3 align-top">
                          {row.type === 'Agst Ref' ? (
                            <div>
                              <select
                                value={row.orderId || ''}
                                onChange={(e) => updateAllocation(row.id, 'orderId', e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 outline-none text-slate-800"
                              >
                                <option value="" disabled>Select pending invoice...</option>
                                {pendingOrders.map(order => {
                                  const isSelectedElsewhere = allocations.some(a => a.id !== row.id && a.orderId === order.id);
                                  if (isSelectedElsewhere) return null;
                                  return (
                                    <option key={order.id} value={order.id}>
                                      {order.sale_entry_number || order.id} — ₹{order.balance.toLocaleString()} pending
                                    </option>
                                  );
                                })}
                              </select>
                              {row.orderId && row.maxAmount && (
                                <div className="text-[11px] text-slate-500 mt-1 pl-1">
                                  Pending balance: <span className="font-semibold text-emerald-600">₹{row.maxAmount.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center h-9">
                              <span className="text-sm text-slate-500 italic px-1">{row.type}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 align-top">
                          {row.type === 'Agst Ref' ? (
                            <input
                              type="number"
                              value={row.amountAllocated === 0 ? '' : row.amountAllocated}
                              onChange={(e) => {
                                let val = Number(e.target.value);
                                if (row.maxAmount && val > row.maxAmount) {
                                  val = row.maxAmount;
                                  toast.error(`Cannot exceed pending balance ₹${row.maxAmount.toLocaleString()}`);
                                }
                                updateAllocation(row.id, 'amountAllocated', val);
                              }}
                              placeholder={row.orderId ? '0.00' : '—'}
                              disabled={!row.orderId}
                              className="w-full px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-right font-bold text-emerald-800 outline-none focus:ring-1 focus:border-emerald-400 focus:ring-emerald-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                            />
                          ) : (
                            <input
                              type="number"
                              value={row.amountAllocated === 0 ? '' : row.amountAllocated}
                              onChange={(e) => updateAllocation(row.id, 'amountAllocated', Number(e.target.value))}
                              placeholder="Enter amount"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-sm text-right font-bold text-slate-800 outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-200"
                            />
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-center">
                          {allocations.length > 1 && (
                            <button
                              onClick={() => removeAllocation(row.id)}
                              className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <button
                  onClick={addAllocationRow}
                  className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus size={16} />
                  Add Row
                </button>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Receipt Amount</div>
                    <div className={`text-xl font-bold mt-0.5 ${totalReceiptAmount > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                      ₹{totalReceiptAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  {totalReceiptAmount > 0 && (
                    <CheckCircle size={24} className="text-emerald-500" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
              <Wallet className="mx-auto text-slate-300 mb-3" size={36} />
              <p className="text-slate-500 font-medium">Select a customer above to begin adding bill-wise details</p>
              <p className="text-slate-400 text-sm mt-1">You can allocate against pending invoices, or record an advance / on-account payment</p>
            </div>
          )}

          {/* Section 3: Payment Mode & Extra Fields (only shown after customer selected) */}
          {selectedCustomerId && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Account Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Payment Mode */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Account (Payment Mode) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value)}
                    className="w-full md:w-1/2 px-3 py-2.5 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm font-medium text-slate-800"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                {/* CASH fields */}
                {paymentMode === 'CASH' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cash Ledger</label>
                    <input
                      type="text"
                      value={cashLedger}
                      onChange={e => setCashLedger(e.target.value)}
                      placeholder="Cash"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                )}

                {/* UPI fields */}
                {paymentMode === 'UPI' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">UPI App</label>
                      <input
                        type="text"
                        value={upiApp}
                        onChange={e => setUpiApp(e.target.value)}
                        placeholder="PhonePe, GPay, etc."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                      />
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
                      <input
                        type="text"
                        value={utr}
                        onChange={e => setUtr(e.target.value)}
                        placeholder="UTR Number"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                      />
                    </div>
                  </>
                )}

                {/* Bank Transfer fields */}
                {paymentMode === 'BANK_TRANSFER' && (
                  <>
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
                      <label className="block text-xs font-semibold text-slate-600 mb-1">UTR Number</label>
                      <input
                        type="text"
                        value={utr}
                        onChange={e => setUtr(e.target.value)}
                        placeholder="UTR Number"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                      />
                    </div>
                  </>
                )}

                {/* Reference Number & Remarks — always shown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Reference Number</label>
                  <input
                    type="text"
                    value={refNumber}
                    onChange={e => setRefNumber(e.target.value)}
                    placeholder="Txn ID, Cheque No, etc."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Optional notes or references"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-sm"
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
