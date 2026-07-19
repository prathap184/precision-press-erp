'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { updateHSNDescriptionAction, toggleHSNStatusAction } from '@/lib/actions/hsn';
import { ChevronLeft, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function EditHSNPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [hsn, setHsn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHsn() {
      const { data, error } = await supabase
        .from('hsn_master')
        .select('*')
        .eq('id', params.id)
        .single();
      if (data) setHsn(data);
      if (error) setError('HSN code not found.');
      setLoading(false);
    }
    fetchHsn();
  }, [params.id]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const formData = new FormData(e.currentTarget);
    const description = formData.get('description') as string;
    
    startTransition(async () => {
      const result = await updateHSNDescriptionAction(params.id, description);
      if (result.success) {
        setSuccess('Description updated successfully.');
        router.refresh();
      } else {
        setError(result.error || 'Failed to update description.');
      }
    });
  };

  const handleToggleStatus = async () => {
    if (!hsn) return;
    setError(null);
    setSuccess(null);
    const newStatus = !hsn.is_active;
    
    startTransition(async () => {
      const result = await toggleHSNStatusAction(params.id, hsn.hsn_code, hsn.is_active);
      if (result.success) {
        setHsn((prev: any) => ({ ...prev, is_active: newStatus }));
        setSuccess(`HSN code ${newStatus ? 'activated' : 'deactivated'} successfully.`);
        router.refresh();
      } else {
        setError(result.error || 'Failed to toggle status.');
      }
    });
  };

  if (loading) return <div className="p-6">Loading HSN details...</div>;
  if (!hsn) return <div className="p-6 text-red-600">Error: {error || 'HSN code not found'}</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/hsn-master" className="flex items-center text-sm text-blue-600 hover:text-blue-800 mb-2 font-medium">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to HSN Master
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit HSN: {hsn.hsn_code}</h1>
        <p className="text-muted-foreground text-sm">Update the description or manage active status.</p>
      </div>

      <div className="bg-white rounded-md border shadow-sm p-6 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-md flex items-center gap-2 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-4 rounded-md flex items-center gap-2 text-sm">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p>{success}</p>
          </div>
        )}

        <div className="flex justify-between items-center p-4 bg-slate-50 border rounded-md">
          <div>
            <h3 className="font-semibold text-slate-800">Status</h3>
            <p className="text-sm text-slate-500">
              Current status: <span className={`font-bold ${hsn.is_active ? 'text-emerald-600' : 'text-red-600'}`}>{hsn.is_active ? 'Active' : 'Inactive'}</span>
            </p>
          </div>
          <button
            onClick={handleToggleStatus}
            disabled={isPending}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
              hsn.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
          >
            {isPending ? 'Processing...' : hsn.is_active ? 'Deactivate HSN' : 'Activate HSN'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="hsnCode" className="text-sm font-semibold text-slate-700">HSN Code (Cannot be changed)</label>
            <input 
              type="text" 
              id="hsnCode" 
              value={hsn.hsn_code} 
              disabled 
              className="w-full px-3 py-2 border rounded-md text-sm bg-slate-100 text-slate-500 cursor-not-allowed"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-semibold text-slate-700">Description <span className="text-red-500">*</span></label>
            <textarea 
              id="description" 
              name="description" 
              required 
              rows={4}
              defaultValue={hsn.description}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            ></textarea>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button 
              type="submit" 
              disabled={isPending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isPending ? 'Saving...' : 'Update Description'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
