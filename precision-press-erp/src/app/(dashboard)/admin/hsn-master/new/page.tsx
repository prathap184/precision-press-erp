'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createHSNAction } from '@/lib/actions/hsn';
import { ChevronLeft, Save, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function AddHSNPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await createHSNAction(formData);
      if (result.success) {
        router.push('/admin/hsn-master');
      } else {
        setError(result.error || 'An unexpected error occurred.');
      }
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/hsn-master" className="flex items-center text-sm text-blue-600 hover:text-blue-800 mb-2 font-medium">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to HSN Master
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Add New HSN</h1>
        <p className="text-muted-foreground text-sm">
          Register a new Harmonized System of Nomenclature code and its initial GST rate.
        </p>
      </div>

      <div className="bg-white rounded-md border shadow-sm p-6">
        {error && (
          <div className="mb-6 bg-red-50 text-red-700 border border-red-200 p-4 rounded-md flex items-center gap-2 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="hsnCode" className="text-sm font-semibold text-slate-700">HSN Code <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                id="hsnCode" 
                name="hsnCode" 
                required 
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. 4820"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="gstRate" className="text-sm font-semibold text-slate-700">Initial GST % <span className="text-red-500">*</span></label>
              <input 
                type="number" 
                step="0.01" 
                id="gstRate" 
                name="gstRate" 
                required 
                className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. 18.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-semibold text-slate-700">Description <span className="text-red-500">*</span></label>
            <textarea 
              id="description" 
              name="description" 
              required 
              rows={3}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="e.g. Registers, Account Books, Note Books..."
            ></textarea>
          </div>

          <div className="space-y-2 md:w-1/2">
            <label htmlFor="effectiveFrom" className="text-sm font-semibold text-slate-700">Effective From Date <span className="text-red-500">*</span></label>
            <input 
              type="date" 
              id="effectiveFrom" 
              name="effectiveFrom" 
              required 
              defaultValue={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button 
              type="submit" 
              disabled={isPending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isPending ? 'Saving...' : 'Save HSN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
