'use client';

import React, { useState } from 'react';
import { createSupplier } from '@/lib/actions/suppliers';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreateSupplierPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    gstin: '',
    phone: '',
    email: '',
    address: '',
    state: '',
    pan_number: '',
    contact_person: '',
    opening_balance: 0,
    bank_name: '',
    account_number: '',
    ifsc_code: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await createSupplier(formData);
      if (res.success) {
        router.push('/admin/suppliers');
      } else {
        setError('Failed to create supplier.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center space-x-4 mb-6">
        <Link href="/admin/suppliers" className="text-slate-500 hover:text-slate-900">
          ← Back
        </Link>
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Create Supplier</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow border border-slate-200 space-y-4">
        {error && <div className="bg-red-50 text-red-600 p-3 rounded">{error}</div>}

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">Company / Supplier Name *</label>
          <input 
            type="text" 
            required 
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            placeholder="e.g. ABC Paper Mills"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">GSTIN</label>
            <input 
              type="text" 
              value={formData.gstin}
              onChange={(e) => setFormData({...formData, gstin: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">State</label>
            <input 
              type="text" 
              value={formData.state}
              onChange={(e) => setFormData({...formData, state: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Phone</label>
            <input 
              type="text" 
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
            <input 
              type="email" 
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">PAN Number</label>
            <input 
              type="text" 
              value={formData.pan_number}
              onChange={(e) => setFormData({...formData, pan_number: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Contact Person</label>
            <input 
              type="text" 
              value={formData.contact_person}
              onChange={(e) => setFormData({...formData, contact_person: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Opening Balance (₹)</label>
            <input 
              type="number" 
              value={formData.opening_balance}
              onChange={(e) => setFormData({...formData, opening_balance: Number(e.target.value)})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Bank Name</label>
            <input 
              type="text" 
              value={formData.bank_name}
              onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Account Number</label>
            <input 
              type="text" 
              value={formData.account_number}
              onChange={(e) => setFormData({...formData, account_number: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">IFSC Code</label>
            <input 
              type="text" 
              value={formData.ifsc_code}
              onChange={(e) => setFormData({...formData, ifsc_code: e.target.value})}
              className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">Address</label>
          <textarea 
            rows={3}
            value={formData.address}
            onChange={(e) => setFormData({...formData, address: e.target.value})}
            className="w-full border-slate-300 rounded p-2 border focus:ring-2 focus:ring-indigo-500 outline-none" 
          />
        </div>

        <div className="pt-4 flex justify-end">
          <button 
            type="submit" 
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded shadow disabled:opacity-50"
          >
            {loading ? 'Creating & Syncing...' : 'Save Supplier'}
          </button>
        </div>
      </form>
    </div>
  );
}
