'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { supabase } from '@/lib/supabase';
import { getCustomerQuotations } from '@/lib/actions/quotations';
import { 
  FileText, Search, Loader2, ArrowRight,
  CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import Link from 'next/link';

type Quotation = {
  id: string;
  quotation_number: string;
  customer_id: string;
  items: any[];
  parent_order_id?: string;
  status: string;
  created_at: string;
  total_amount?: number | string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT:    { label: 'Draft',     color: 'bg-slate-100 text-slate-600 border-slate-200',  icon: <Clock size={12} /> },
  PENDING:  { label: 'Pending',   color: 'bg-blue-50 text-blue-600 border-blue-200',      icon: <Clock size={12} /> },
  ACCEPTED: { label: 'Accepted',  color: 'bg-green-50 text-green-600 border-green-200',   icon: <CheckCircle size={12} /> },
  REJECTED: { label: 'Rejected',  color: 'bg-red-50 text-red-500 border-red-200',         icon: <AlertCircle size={12} /> },
  ORDERED:  { label: 'Converted to Order', color: 'bg-indigo-50 text-indigo-600 border-indigo-200', icon: <CheckCircle size={12} /> },
};

export default function CustomerQuotationsPage() {
  const { profile } = useAuth();
  const { effectiveUserId } = useEffectiveUser(profile?.uid);
  
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'ORDERED'>('ALL');

  useEffect(() => {
    if (!effectiveUserId) return;

    const fetchQuotations = async () => {
      setLoading(true);
      try {
        const data = await getCustomerQuotations(effectiveUserId);
        setQuotations(data);
      } catch (err) {
        console.error('Failed to fetch quotations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuotations();
  }, [effectiveUserId]);

  const filtered = quotations.filter(q => {
    const matchesSearch = (q.quotation_number?.toLowerCase().includes(search.toLowerCase()) || q.id.toLowerCase().includes(search.toLowerCase())) ||
      (q.status && q.status.toLowerCase().includes(search.toLowerCase()));
    
    if (activeTab === 'ALL') return matchesSearch;
    return matchesSearch && q.status === activeTab;
  });

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <section className="flex flex-col md:flex-row justify-between md:items-end gap-6 px-2">
        <div className="space-y-2">
          <h1 className="text-4xl font-black font-display tracking-tighter text-slate-900 underline decoration-blue-500/20 underline-offset-8">
            My Quotations
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            Review and manage your custom price quotes
          </p>
        </div>
      </section>

      {/* Controls */}
      <div className="px-2 sticky top-0 z-40 py-4 bg-white/80 backdrop-blur-xl flex flex-col gap-4">
        
        {/* Tabs */}
        <div className="flex gap-2">
          {['ALL', 'PENDING', 'ACCEPTED', 'ORDERED'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search quotations by ID or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* List */}
      <div className="px-2">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
            <Loader2 className="animate-spin text-blue-500" size={32} />
            <p className="text-sm font-semibold tracking-wide uppercase">Loading quotations...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col items-center justify-center gap-4">
            <div className="w-20 h-20 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center text-slate-300">
              <FileText size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">No Quotations Found</h3>
              <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
                {search ? 'Try adjusting your search terms.' : 'You don\'t have any quotations yet.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-slate-200 overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="py-4 px-6">Quotation ID</th>
                  <th className="py-4 px-6">Date</th>
                  <th className="py-4 px-6">Order ID</th>
                  <th className="py-4 px-6 text-center">Items</th>
                  <th className="py-4 px-6">Total Amount</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(quotation => {
                  const cfg = STATUS_CONFIG[quotation.status] || STATUS_CONFIG['PENDING'];
                  const itemCount = quotation.items?.length || 0;
                  const date = new Date(quotation.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  });
                  
                  return (
                    <tr key={quotation.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="text-sm font-bold text-slate-900 font-mono tracking-tight group-hover:text-blue-600 transition-colors">
                          {quotation.quotation_number || `#${quotation.id.slice(0, 8)}`}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-xs font-semibold text-slate-500">
                        {date}
                      </td>
                      <td className="py-4 px-6 text-xs font-mono font-bold text-slate-500">
                        {quotation.parent_order_id ? quotation.parent_order_id : '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                          <FileText size={14} className="text-slate-400" />
                          {itemCount}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm font-black text-slate-800">
                        {quotation.total_amount ? `Rs. ${Number(quotation.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="py-4 px-6">
                        <div className={`inline-flex px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider items-center gap-1.5 ${cfg.color}`}>
                          {cfg.icon}
                          {cfg.label}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Link 
                          href={`/dashboard/quotations/${quotation.id}`}
                          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 border border-transparent group-hover:border-blue-100 transition-all hover:scale-105"
                        >
                          <ArrowRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
