'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2 } from 'lucide-react';
import { triggerPushAllInvoices } from '@/lib/actions/tally-sync';
import { toast } from 'react-hot-toast';

export function TallyPushInvoicesButton() {
  const [loading, setLoading] = useState(false);

  const handlePush = async () => {
    if (!confirm('Are you sure you want to push all recent Invoices to Tally?')) return;
    
    setLoading(true);
    try {
      const result = await triggerPushAllInvoices('admin');
      if (result.success) {
        toast.success(`Queued ${result.queued} invoices for sync!`);
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error('An error occurred while pushing invoices.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={handlePush} 
      disabled={loading}
      className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-all flex items-center gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
      Sync Invoices
    </Button>
  );
}
