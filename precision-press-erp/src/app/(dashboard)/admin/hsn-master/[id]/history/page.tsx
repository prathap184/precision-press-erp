'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { addNewGSTRateAction } from '@/lib/actions/hsn';
import { ChevronLeft, PlusCircle, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

export default function HSNHistoryPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [hsn, setHsn] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    const { data: hsnData } = await supabase.from('hsn_master').select('*').eq('id', params.id).single();
    const { data: historyData } = await supabase.from('hsn_gst_rates').select('*').eq('hsn_id', params.id).order('effective_from', { ascending: false });
    
    if (hsnData) setHsn(hsnData);
    if (historyData) setHistory(historyData);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [params.id]);

  const handleAddRate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const formData = new FormData(e.currentTarget);
    const gstRate = parseFloat(formData.get('gstRate') as string);
    const effectiveFrom = formData.get('effectiveFrom') as string;
    
    startTransition(async () => {
      const result = await addNewGSTRateAction(params.id, gstRate, effectiveFrom);
      if (result.success) {
        setSuccess('New GST rate added successfully.');
        (e.target as HTMLFormElement).reset();
        await fetchHistory();
      } else {
        setError(result.error || 'Failed to add new GST rate.');
      }
    });
  };

  if (loading) return <div className="p-6">Loading history...</div>;
  if (!hsn) return <div className="p-6 text-red-600">HSN code not found.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/hsn-master" className="flex items-center text-sm text-blue-600 hover:text-blue-800 mb-2 font-medium">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to HSN Master
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">GST History: {hsn.hsn_code}</h1>
        <p className="text-muted-foreground text-sm">View historical GST rates and schedule new revisions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-md border shadow-sm overflow-hidden">
          <h3 className="font-bold text-slate-800 p-5 border-b bg-slate-50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" /> Rate History
          </h3>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
              <tr>
                <th className="px-5 py-3">GST Rate</th>
                <th className="px-5 py-3">Effective From</th>
                <th className="px-5 py-3">Effective To</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-slate-500">No history found.</td>
                </tr>
              ) : (
                history.map((record) => {
                  const isActive = !record.effective_to;
                  return (
                    <tr key={record.id} className={isActive ? 'bg-blue-50/50' : ''}>
                      <td className="px-5 py-3 font-semibold">{record.gst_rate}%</td>
                      <td className="px-5 py-3 text-slate-600">{new Date(record.effective_from).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3 text-slate-600">{record.effective_to ? new Date(record.effective_to).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {isActive ? 'Current' : 'Retired'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-md border shadow-sm p-5 h-fit">
          <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Add New Rate</h3>
          
          {error && (
            <div className="mb-4 bg-red-50 text-red-700 border border-red-200 p-3 rounded-md flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded-md flex items-start gap-2 text-xs">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{success}</p>
            </div>
          )}

          <form onSubmit={handleAddRate} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="gstRate" className="text-sm font-semibold text-slate-700">New GST % <span className="text-red-500">*</span></label>
              <input 
                type="number" 
                step="0.01" 
                id="gstRate" 
                name="gstRate" 
                required 
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. 12.00"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="effectiveFrom" className="text-sm font-semibold text-slate-700">Effective From <span className="text-red-500">*</span></label>
              <input 
                type="date" 
                id="effectiveFrom" 
                name="effectiveFrom" 
                required 
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">Must be later than the current rate's effective date.</p>
            </div>

            <button 
              type="submit" 
              disabled={isPending}
              className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
            >
              <PlusCircle className="w-4 h-4" />
              {isPending ? 'Processing...' : 'Apply New Rate'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
