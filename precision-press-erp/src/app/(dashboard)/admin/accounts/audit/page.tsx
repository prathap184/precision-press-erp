'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { getCustomerLedgerSummaries, CustomerSummary } from '@/lib/actions/accounts';
import { 
  Calculator, 
  ArrowUpRight, 
  Search, 
  Download, 
  RefreshCw,
  TrendingUp,
  CreditCard,
  History,
  AlertTriangle,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

export default function FinancialAuditPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getCustomerLedgerSummaries();
      setCustomers(data);
    } catch (error) {
      toast.error('Failed to load audit data');
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.uid.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    totalSales: customers.reduce((acc, c) => acc + (c.totalSpend || 0), 0),
    totalPayments: customers.reduce((acc, c) => acc + (c.totalPayments || 0), 0),
    totalOutstanding: customers.reduce((acc, c) => acc + (c.calculatedBalance || 0), 0),
    totalAdjustments: customers.reduce((acc, c) => acc + ((c.usedCredit || 0) - (c.calculatedBalance || 0)), 0),
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-[28px] font-bold font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-8 h-8 text-indigo-600" />
            PURE FINANCIAL AUDIT
          </h1>
          <p className="text-slate-500 font-medium">Order-based revenue tracking vs Physical payments</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchData}
            disabled={loading}
            className="bg-white border border-slate-200 text-slate-700 px-4 h-11 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
          <button className="bg-slate-900 text-white px-4 h-11 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md">
            <Download className="w-4 h-4" />
            Export Audit Report
          </button>
        </div>
      </div>

      {/* Rest omitted for brevity in disabled backup */}
    </div>
  );
}
