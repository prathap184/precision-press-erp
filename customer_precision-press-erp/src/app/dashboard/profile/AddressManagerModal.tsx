'use client';

import React, { useState } from 'react';
import { updateCustomerProfile } from '@/lib/actions/users';
import { useAuth } from '@/lib/auth-context';
import { UserProfile, DeliveryAddress } from '@/types/auth';
import { MapPin, Plus, Trash2, Star } from 'lucide-react';

interface AddressManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
}

export function AddressManagerModal({ isOpen, onClose, profile }: AddressManagerModalProps) {
  const { refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newAddress, setNewAddress] = useState<Partial<DeliveryAddress>>({
    houseNumber: '',
    roadName: '',
    city: '',
    state: '',
    pincode: '',
  });

  if (!isOpen) return null;

  const addresses = profile.addresses || [];

  const handleSetDefault = async (id: string) => {
    setLoading(true);
    const updatedAddresses = addresses.map(a => ({
      ...a,
      isDefault: a.id === id
    }));
    
    const result = await updateCustomerProfile(profile.uid, { 
      addresses: updatedAddresses,
      defaultAddressId: id 
    });
    
    if (result.success) {
      await refreshProfile();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    setLoading(true);
    
    const updatedAddresses = addresses.filter(a => a.id !== id);
    const result = await updateCustomerProfile(profile.uid, { addresses: updatedAddresses });
    
    if (result.success) {
      await refreshProfile();
    }
    setLoading(false);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const newAddr: DeliveryAddress = {
      id: Date.now().toString(),
      houseNumber: newAddress.houseNumber || '',
      roadName: newAddress.roadName || '',
      city: newAddress.city || '',
      state: newAddress.state || '',
      pincode: newAddress.pincode || '',
      isDefault: addresses.length === 0, // Auto-default if it's the first one
    };

    const updatedAddresses = [...addresses, newAddr];
    
    const updates: Partial<UserProfile> = { addresses: updatedAddresses };
    if (newAddr.isDefault) {
      updates.defaultAddressId = newAddr.id;
    }

    const result = await updateCustomerProfile(profile.uid, updates);
    
    if (result.success) {
      await refreshProfile();
      setIsAdding(false);
      setNewAddress({ houseNumber: '', roadName: '', city: '', state: '', pincode: '' });
    } else {
      setError(result.error || 'Failed to add address');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 italic flex items-center gap-3">
              <MapPin size={24} className="text-blue-500" /> Shipping Addresses
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Manage your delivery locations</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-11 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold">{error}</div>
          )}

          {!isAdding ? (
            <div className="space-y-6">
              {addresses.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <MapPin size={40} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">No addresses found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 max-h-[50vh] overflow-y-auto pr-2">
                  {addresses.map(addr => (
                    <div key={addr.id} className={`p-6 rounded-2xl border-2 transition-all ${addr.isDefault ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-white hover:border-blue-200'}`}>
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1 flex-1">
                          <p className="text-sm font-bold text-slate-900">
                            {[addr.houseNumber, addr.roadName].filter(Boolean).join(', ')}
                          </p>
                          <p className="text-xs font-bold text-slate-500">
                            {addr.city}, {addr.state} - {addr.pincode}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!addr.isDefault && (
                            <button
                              onClick={() => handleSetDefault(addr.id)}
                              disabled={loading}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition-colors disabled:opacity-50"
                            >
                              Set Default
                            </button>
                          )}
                          {addr.isDefault && (
                            <div className="px-3 py-1.5 rounded-lg bg-blue-500 text-[9px] font-black uppercase tracking-widest text-white flex items-center gap-1">
                              <Star size={10} fill="currentColor" /> Default
                            </div>
                          )}
                          <button
                            onClick={() => handleDelete(addr.id)}
                            disabled={loading}
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setIsAdding(true)}
                className="w-full py-4 border-2 border-dashed border-blue-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center justify-center gap-2 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <Plus size={16} /> Add New Address
              </button>
            </div>
          ) : (
            <form onSubmit={handleAddSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="p-6 bg-slate-50 rounded-3xl space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-6">Enter New Address Details</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">House/Building No.</label>
                    <input
                      type="text"
                      value={newAddress.houseNumber}
                      onChange={e => setNewAddress({...newAddress, houseNumber: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Road/Area Name</label>
                    <input
                      type="text"
                      value={newAddress.roadName}
                      onChange={e => setNewAddress({...newAddress, roadName: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">City</label>
                    <input
                      type="text"
                      value={newAddress.city}
                      onChange={e => setNewAddress({...newAddress, city: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">State</label>
                    <input
                      type="text"
                      value={newAddress.state}
                      onChange={e => setNewAddress({...newAddress, state: e.target.value})}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Pincode</label>
                  <input
                    type="text"
                    value={newAddress.pincode}
                    onChange={e => setNewAddress({...newAddress, pincode: e.target.value})}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
                  disabled={loading}
                >
                  Back to List
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:bg-blue-700 hover:-translate-y-0.5 transition-all disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save New Address'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
