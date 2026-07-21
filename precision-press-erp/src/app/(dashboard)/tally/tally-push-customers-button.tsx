'use client';

import React, { useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { triggerPushAllCustomers } from '@/lib/actions/tally-sync';
import toast from 'react-hot-toast';

export function TallyPushCustomersButton() {
  const [loading, setLoading] = useState(false);

  const handlePush = async () => {
    if (!window.confirm('This will queue all customers to be synced/created in Tally. Continue?')) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await triggerPushAllCustomers('admin-dashboard');
      if (res.success) {
        toast.success(`Queued ${res.queued} customers for Tally sync`);
      } else {
        toast.error(res.error || 'Failed to queue customers');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePush}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm border border-indigo-200 transition-colors"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
      Push All Customers
    </button>
  );
}
