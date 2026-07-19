'use client';

import React, { useState } from 'react';
import { updateCustomerProfile } from '@/lib/actions/users';
import { useAuth } from '@/lib/auth-context';
import { UserProfile } from '@/types/auth';

interface EditIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
}

export function EditIdentityModal({ isOpen, onClose, profile }: EditIdentityModalProps) {
  const { refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: profile.name || '',
    businessName: profile.businessName || '',
    phone: profile.phone || '',
    gstType: profile.gstType || 'Unregistered',
    gstNumber: profile.gstNumber || '',
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await updateCustomerProfile(profile.uid, formData);
    
    if (result.success) {
      await refreshProfile();
      onClose();
    } else {
      setError(result.error || 'Failed to update profile');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-slate-100">
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 italic">Edit Identity</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Update your business profile</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold">{error}</div>
          )}

          <div className="space-y-4">
            <div>
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Contact Name</label>
               <input
                 type="text"
                 name="name"
                 value={formData.name}
                 onChange={handleChange}
                 className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                 required
               />
            </div>
            
            <div>
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Business Name</label>
               <input
                 type="text"
                 name="businessName"
                 value={formData.businessName}
                 onChange={handleChange}
                 className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
               />
            </div>

            <div>
               <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Phone Number</label>
               <input
                 type="tel"
                 name="phone"
                 value={formData.phone}
                 onChange={handleChange}
                 className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
               />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">GST Type</label>
                  <select
                    name="gstType"
                    value={formData.gstType}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Unregistered">Unregistered</option>
                    <option value="Regular">Regular</option>
                    <option value="Composition">Composition</option>
                  </select>
               </div>
               
               {formData.gstType !== 'Unregistered' && (
                  <div>
                     <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">GST Number</label>
                     <input
                       type="text"
                       name="gstNumber"
                       value={formData.gstNumber}
                       onChange={handleChange}
                       className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                       required
                     />
                  </div>
               )}
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
             <button
               type="button"
               onClick={onClose}
               className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
               disabled={loading}
             >
               Cancel
             </button>
             <button
               type="submit"
               disabled={loading}
               className="px-8 py-3 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:bg-blue-700 hover:-translate-y-0.5 transition-all disabled:opacity-50"
             >
               {loading ? 'Saving...' : 'Save Changes'}
             </button>
          </div>
        </form>
      </div>
    </div>
  );
}
