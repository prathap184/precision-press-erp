'use client';

import React, { useState, useEffect } from 'react';
import { 
  getLedger, 
  verifyLedgerEntry, 
  getCustomerLedgerSummaries, 
  getOrderForLedger,
  LedgerEntry,
  CustomerSummary,
  migrateCustomerFinancials
} from '@/lib/actions/accounts';
import { 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  User, 
  Search,
  Filter,
  RefreshCw,
  Wallet,
  ShieldCheck,
  MoreHorizontal,
  X,
  FileText,
  Package,
  Layers,
  ChevronRight,
  Calculator
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AccountVerification() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLedger, setActiveLedger] = useState<'OVERALL' | 'CASH' | 'CREDIT'>('OVERALL');
  const [pageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED'>('ALL');
  const [inspecting, setInspecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) {
      setCustomerSearchTerm(q);
      // Also maybe global search? User asked for customer specific profile checking.
    }
    fetchData();
  }, [searchParams]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ledgerData, summaryData] = await Promise.all([
        getLedger({ limit: 100 }), // Load more for client-side search/paging
        getCustomerLedgerSummaries()
      ]);
      setEntries(ledgerData);
      setCustomers(summaryData);
    } catch (error) {
      toast.error('Failed to load accounting data');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (entryId: string) => {
    try {
      const entry = entries.find(e => e.id === entryId);
      const res = await verifyLedgerEntry(entryId, entry?.refId);
      if (res.success) {
        toast.success('Transaction Verified & Order Released');
        // Refresh everything to get updated totals from profiles
        await fetchData();
      }
    } catch (error) {
      toast.error('Verification failed');
    }
  };

  const handleSync = async () => {
    if (!confirm('This will recalculate lifetime totals for ALL customers from historical orders. Continue?')) return;
    setSyncing(true);
    try {
      const res = await migrateCustomerFinancials(false); // LIVE sync
      if (res.success) {
        toast.success(`Sync Complete: Processed ${res.processedCount} customers`);
        await fetchData();
      }
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleInspect = async (orderId: string) => {
    // Find the ledger entry associated with this order ID
    const entry = entries.find(e => e.refId === orderId);
    setInspecting(true);
    try {
      const order = await getOrderForLedger(orderId);
      // Attach the ledger entry to the order object for the UI
      setSelectedOrder({ ...order, ledgerEntry: entry });
    } catch (error) {
      toast.error('Failed to fetch order details');
    } finally {
      setInspecting(false);
    }
  };

  const filteredEntries = entries.filter(e => {
    const matchesSearch = (e.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (e.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (e.refId || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // Ledger Type Logic (including legacy fallback)
    const isCredit = e.ledgerType === 'CREDIT' || (!e.ledgerType && (e.balanceAfter !== e.balanceBefore || e.type === 'RECEIPT'));
    const isCash = e.ledgerType === 'CASH' || (!e.ledgerType && e.balanceAfter === e.balanceBefore && e.type === 'SALE');

    const matchesLedger = activeLedger === 'OVERALL' || 
                         (activeLedger === 'CASH' && isCash) ||
                         (activeLedger === 'CREDIT' && isCredit);

    const matchesFilter = filter === 'ALL' || 
                         (filter === 'PENDING' && !e.isVerified) || 
                         (filter === 'VERIFIED' && e.isVerified);
    return matchesSearch && matchesFilter && matchesLedger;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const paginatedEntries = filteredEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Customer Filtering & Pagination
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                          (c.uid || '').toLowerCase().includes(customerSearchTerm.toLowerCase());
    
    if (activeLedger === 'CASH') return matchesSearch && c.customerType === 'CASH';
    if (activeLedger === 'CREDIT') return matchesSearch && c.customerType === 'CREDIT';
    return matchesSearch;
  });

  const totalCustomerPages = Math.ceil(filteredCustomers.length / pageSize);
  const paginatedCustomers = filteredCustomers.slice((customerPage - 1) * pageSize, customerPage * pageSize);

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextCustomerPage = () => {
    if (customerPage < totalCustomerPages) setCustomerPage(customerPage + 1);
  };

  const handlePrevCustomerPage = () => {
    if (customerPage > 1) setCustomerPage(customerPage - 1);
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto animate-in fade-in duration-700">
      {/* ... existing header ... */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 bg-white p-3 rounded border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight uppercase">Accounts Verification</h1>
          <p className="text-xs text-slate-500">Verify credit deductions and incoming payments</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/accounts/audit"
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-bold uppercase transition-all shadow-sm active:scale-95"
          >
            <Calculator className="w-3.5 h-3.5" />
            Pure Audit
          </Link>
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs font-bold uppercase transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Ledger
          </button>
          <button 
            onClick={handleSync} 
            disabled={syncing || loading}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded text-xs font-bold uppercase transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Live Sync'}
          </button>
        </div>
      </div>

      {/* ... stats ... */}
      <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm w-fit">
        {(['OVERALL', 'CASH', 'CREDIT'] as const).map(l => (
          <button
            key={l}
            onClick={() => { setActiveLedger(l); setCurrentPage(1); }}
            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${activeLedger === l ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {l === 'CASH' && <Wallet className="w-3.5 h-3.5" />}
            {l === 'CREDIT' && <ShieldCheck className="w-3.5 h-3.5" />}
            {l === 'OVERALL' && <Layers className="w-3.5 h-3.5" />}
            {l} Ledger
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`p-4 rounded-xl border transition-all ${activeLedger === 'CREDIT' || activeLedger === 'OVERALL' ? 'bg-indigo-50 border-indigo-100 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
          <div className="flex justify-between items-start mb-1">
            <p className="text-indigo-600 font-bold uppercase text-[10px] tracking-wider">Credit Outstanding</p>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <h3 className="text-2xl font-black text-indigo-900 leading-none">
            ₹{customers.reduce((acc, c) => acc + (c.calculatedBalance || 0), 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-indigo-700 font-bold mt-1 uppercase tracking-tighter">Total Debt Portfolo</p>
        </div>

        <div className={`p-4 rounded-xl border transition-all ${activeLedger === 'CASH' || activeLedger === 'OVERALL' ? 'bg-emerald-50 border-emerald-100 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
          <div className="flex justify-between items-start mb-1">
            <p className="text-emerald-600 font-bold uppercase text-[10px] tracking-wider">Cash Sales (Lifetime)</p>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-black text-emerald-900 leading-none">
            ₹{customers.filter(c => c.customerType === 'CASH').reduce((acc, c) => acc + (c.totalSpend || 0), 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-emerald-700 font-bold mt-1 uppercase tracking-tighter">Verified Cash Revenue</p>
        </div>

        <div className={`p-4 rounded-xl border transition-all ${activeLedger === 'CREDIT' || activeLedger === 'OVERALL' ? 'bg-amber-50 border-amber-100 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
          <div className="flex justify-between items-start mb-1">
            <p className="text-amber-600 font-bold uppercase text-[10px] tracking-wider">Credit Sales (Lifetime)</p>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="text-2xl font-black text-amber-900 leading-none">
            ₹{customers.filter(c => c.customerType === 'CREDIT').reduce((acc, c) => acc + (c.totalSpend || 0), 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-amber-700 font-bold mt-1 uppercase tracking-tighter">Verified Credit Volume</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-white shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-110 transition-transform">
            <Calculator className="w-12 h-12" />
          </div>
          <div className="flex justify-between items-start mb-1 relative z-10">
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Overall Ledger Total</p>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-black text-white leading-none relative z-10">
            ₹{customers.reduce((acc, c) => acc + (c.totalSpend || 0), 0).toLocaleString()}
          </h3>
          <p className="text-[10px] text-emerald-400 font-black mt-1 uppercase tracking-tighter relative z-10">Total Verified Business</p>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-2">
        <div className="flex-1 space-y-2">
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-2 border-b border-slate-200 space-y-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  {activeLedger} TRANSACTION AUDIT
                </h2>
                <div className="flex bg-slate-100 p-0.5 rounded">
                  {(['PENDING', 'VERIFIED', 'ALL'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => { setFilter(f); setCurrentPage(1); }}
                      className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${filter === f ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text"
                  placeholder={`Search ${activeLedger} ledger...`}
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200">
                    <th className="px-3 py-2 border-r border-slate-200">Date / Status</th>
                    <th className="px-3 py-2 border-r border-slate-200">Customer / Reference</th>
                    <th className="px-3 py-2 text-right border-r border-slate-200">
                      {activeLedger === 'CASH' ? 'Order Total' : 'Credit Balance'}
                    </th>
                    <th className="px-3 py-2 text-right border-r border-slate-200">
                      {activeLedger === 'CASH' ? 'Cash In' : 'Debit/Credit'}
                    </th>
                    <th className="px-3 py-2 text-right border-r border-slate-200">
                      {activeLedger === 'CASH' ? 'Settlement' : 'New Balance'}
                    </th>
                    <th className="px-3 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center tabular-nums">
                        <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin mx-auto mb-1.5" />
                        <p className="text-slate-500 font-bold text-[10px] uppercase">Accessing Secure Records...</p>
                      </td>
                    </tr>
                  ) : paginatedEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500 text-xs font-medium tabular-nums">
                        No transactions found for current filters.
                      </td>
                    </tr>
                  ) : paginatedEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors text-xs border-b border-slate-100">
                      <td className="px-3 py-2 border-r border-slate-100 tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          {entry.isVerified ? (
                            <div className="flex items-center gap-1 text-emerald-600 font-bold uppercase text-[9px]">
                              <CheckCircle2 className="w-3 h-3" /> Verified
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-amber-600 font-bold uppercase text-[9px]">
                              <AlertCircle className="w-3 h-3" /> Pending
                            </div>
                          )}
                          <p className="text-[9px] text-slate-400 font-medium">{format(new Date(entry.timestamp), 'dd MMM yyyy HH:mm')}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 border-r border-slate-100 tabular-nums">
                        <div className="flex flex-col">
                          <p className="text-xs font-bold text-slate-900 capitalize">{entry.userName}</p>
                          <button 
                            onClick={() => handleInspect(entry.refId)}
                            className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline uppercase tracking-wider"
                          >
                            {entry.refId}
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-600 border-r border-slate-100 tabular-nums">
                        ₹{(entry.balanceBefore || 0).toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold border-r border-slate-100 ${entry.debit > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {entry.debit > 0 ? `-₹${(entry.debit || 0).toLocaleString()}` : `+₹${(entry.credit || 0).toLocaleString()}`}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">
                        ₹{(entry.balanceAfter || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {!entry.isVerified ? (
                          <button 
                            onClick={() => handleVerify(entry.id)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm"
                          >
                            Verify
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Audited</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination UI */}
            <div className="p-2 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Showing {Math.min(filteredEntries.length, (currentPage - 1) * pageSize + 1)} to {Math.min(filteredEntries.length, currentPage * pageSize)} of <span className="text-slate-700">{filteredEntries.length}</span> entries
              </p>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded border border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
                >
                  Prev
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${currentPage === i + 1 ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      {i + 1}
                    </button>
                  )).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}
                </div>
                <button 
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded border border-slate-200 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* --- CUSTOMER CREDIT WATCH COLUMN --- */}
        <div className="w-full xl:w-[400px] space-y-2">
          <div className="bg-white rounded border border-slate-200 shadow-sm p-3">
            <div className="space-y-2 mb-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <User className="w-4 h-4 text-indigo-600" />
                {activeLedger === 'OVERALL' ? 'Customer Activity' : 
                 activeLedger === 'CASH' ? 'Cash Customers' : 'Credit Watch'}
              </h2>
              
              <div className="relative group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search Customers..."
                  value={customerSearchTerm}
                  onChange={(e) => { setCustomerSearchTerm(e.target.value); setCustomerPage(1); }}
                  className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              {paginatedCustomers.length === 0 ? (
                <div className="py-4 text-center text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  No Customers Found
                </div>
              ) : paginatedCustomers.map((c) => (
                <div key={c.uid} className="p-2 bg-white rounded border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <Link href={`/accountant/ledger?uid=${c.uid}`} className="block overflow-hidden">
                      <p className="font-bold text-slate-800 text-xs hover:text-indigo-600 transition-colors flex items-center gap-1 truncate">
                        {c.name}
                        <ArrowUpRight size={10} className="flex-shrink-0 opacity-50" />
                      </p>
                      <p className="text-[10px] font-medium text-slate-500">
                        {c.customerType === 'CREDIT' ? `Limit: ₹${(c.creditLimit || 0).toLocaleString()}` : 'Cash Customer'}
                      </p>
                      {c.authorizedBy && (
                        <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-600 mt-0.5 truncate">Auth: {c.authorizedBy}</p>
                      )}
                    </Link>
                    <div className={`p-1 rounded flex-shrink-0 ${
                      c.customerType === 'CREDIT' && (c.usedCredit || 0) > (c.creditLimit || 0) * 0.8 
                        ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}>
                      {c.customerType === 'CREDIT' && (c.usedCredit || 0) > (c.creditLimit || 0) * 0.8 ? <AlertCircle className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>{c.customerType === 'CREDIT' ? 'Credit Utilization' : 'Total Orders Value'}</span>
                      <span>{c.customerType === 'CREDIT' ? `${Math.round(((c.usedCredit || 0) / (c.creditLimit || 1)) * 100)}%` : 'Lifetime'}</span>
                    </div>
                    {c.customerType === 'CREDIT' ? (
                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            (c.usedCredit || 0) > (c.creditLimit || 0) * 0.9 ? 'bg-rose-500' :
                            (c.usedCredit || 0) > (c.creditLimit || 0) * 0.7 ? 'bg-amber-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${Math.min(((c.usedCredit || 0) / (c.creditLimit || 1)) * 100, 100)}%` }}
                        />
                      </div>
                    ) : (
                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-full opacity-30" />
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-0.5">
                      <div className="flex flex-col">
                        <p className="text-[10px] font-medium text-slate-600">
                          {c.customerType === 'CREDIT' ? `Used: ₹${(c.usedCredit || 0).toLocaleString()}` : `Total Sales: ₹${(c.totalSpend || 0).toLocaleString()}`}
                        </p>
                        {c.customerType === 'CREDIT' && Math.abs((c.usedCredit || 0) - (c.calculatedBalance || 0)) > 1 && (
                          <p className="text-[9px] text-amber-600 font-bold uppercase">
                            Adj: ₹{((c.usedCredit || 0) - (c.calculatedBalance || 0)).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="text-[10px] font-bold text-indigo-600">
                          {c.customerType === 'CREDIT' ? `Left: ₹${(c.availableCredit || 0).toLocaleString()}` : `${c.customerType} Profile`}
                        </p>
                        <p className="text-[9px] text-slate-400 font-medium">
                          {c.customerType === 'CREDIT' ? `Pure: ₹${(c.calculatedBalance || 0).toLocaleString()}` : 'Order Based'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Customer Pagination controls */}
            {totalCustomerPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
                <button 
                  onClick={handlePrevCustomerPage}
                  disabled={customerPage === 1}
                  className="px-2 py-1 rounded border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Page {customerPage} / {totalCustomerPages}
                </span>
                <button 
                  onClick={handleNextCustomerPage}
                  disabled={customerPage === totalCustomerPages}
                  className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
          
          <div className="bg-slate-800 rounded border border-slate-700 p-3 text-white shadow-sm">
            <h4 className="font-bold text-[10px] uppercase tracking-wider mb-1">Internal Audit Rule</h4>
            <p className="text-slate-300 text-[10px] leading-relaxed mb-2">
              All credit deductions (SALE) must be cross-verified with the physical order approval. Verify receipts (RECEIPT) against bank statements.
            </p>
            <button className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border border-slate-600 shadow-sm">
              Download Full Statement
            </button>
          </div>
        </div>
      </div>

      {/* --- ORDER INSPECTION MODAL --- */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setSelectedOrder(null)} 
          />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-200 border border-slate-200 flex flex-col">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded text-white shadow-sm">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 leading-none mb-1">{selectedOrder.id}</h3>
                  <p className="text-indigo-600 text-xs font-medium uppercase tracking-wider">
                    {selectedOrder.customerSnapshot?.name || selectedOrder.customerName} • {selectedOrder.orderType} Order
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  href={`/accountant/ledger?uid=${selectedOrder.customerId}`}
                  className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded border border-slate-200 text-xs font-medium transition-colors"
                >
                  View Ledger <ArrowUpRight size={14} />
                </Link>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Credit Authorization Details */}
              {selectedOrder.orderType === 'CREDIT' && (
                <div className="bg-indigo-50 rounded border border-indigo-100 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-600 rounded text-white">
                      <Wallet size={14} />
                    </div>
                    <h4 className="text-sm font-bold text-indigo-900">Credit Utilization Analysis</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-indigo-600">Before Transaction</p>
                      <p className="text-lg font-bold text-indigo-900 border-b border-indigo-200 pb-1">
                        ₹{(selectedOrder.ledgerEntry?.balanceBefore || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-rose-600">Credit To Deduct</p>
                      <p className="text-lg font-bold text-rose-600 border-b border-rose-200 pb-1">
                        ₹{(selectedOrder.ledgerEntry?.debit || selectedOrder.amounts?.grandTotal || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-emerald-600">Balance After</p>
                      <p className="text-lg font-bold text-emerald-700 border-b border-emerald-200 pb-1">
                        ₹{(selectedOrder.ledgerEntry?.balanceAfter || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-indigo-500">Remaining Credit</p>
                      <p className="text-lg font-bold text-indigo-800 border-b border-indigo-200 pb-1">
                        ₹{(selectedOrder.ledgerEntry?.availableCredit || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded border border-indigo-100 text-xs font-medium text-indigo-700">
                    Note: Approving this order will officially deduct ₹{(selectedOrder.amounts?.grandTotal || 0).toLocaleString()} from {selectedOrder.customerSnapshot?.name || 'the customer'}&apos;s credit line and release it for production.
                  </div>
                </div>
              )}

              {/* Order Items */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Billable Items
                </h4>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white rounded border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-50 rounded flex items-center justify-center border border-slate-200">
                          <Layers className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{item.productName}</p>
                          <p className="text-xs text-slate-500">{item.projectName || 'Stock Product'}</p>
                        </div>
                      </div>
                      <div className="mt-2 sm:mt-0 text-right">
                        <p className="text-sm font-bold text-slate-800">₹{(item.pricingSnapshot?.subTotal || 0).toLocaleString()}</p>
                        <p className="text-xs text-indigo-600">
                          {item.specs?.quantity || 1} Units
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">Delivery Address</p>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
                    {selectedOrder.delivery?.address || 'Pickup from Store'}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-500">Subtotal</span>
                    <span className="text-sm font-medium text-slate-800">₹{(selectedOrder.amounts?.base || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-500">GST (18%)</span>
                    <span className="text-sm font-medium text-slate-800">₹{(selectedOrder.amounts?.gst || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                    <span className="text-sm font-bold text-slate-800">Grand Total</span>
                    <span className="text-lg font-bold text-indigo-600">₹{(selectedOrder.amounts?.grandTotal || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded transition-colors"
                disabled={inspecting}
              >
                Close
              </button>
              {selectedOrder.paymentStatus !== 'VERIFIED' && selectedOrder.ledgerEntry?.id && (
                <button 
                  onClick={() => {
                    handleVerify(selectedOrder.ledgerEntry.id);
                    setSelectedOrder(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  Approve &amp; Release
                </button>
              )}
              {selectedOrder.paymentStatus !== 'VERIFIED' && !selectedOrder.ledgerEntry?.id && (
                <span className="text-xs text-amber-600 font-medium self-center">
                  No ledger entry found — verify from the transaction queue.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay for Inspecting */}
      {inspecting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded border border-slate-200 shadow-lg flex flex-col items-center">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
            <p className="text-slate-800 font-bold text-sm">Inspecting Order Details...</p>
          </div>
        </div>
      )}
    </div>
  );
}
