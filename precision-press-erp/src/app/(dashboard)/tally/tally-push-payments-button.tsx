'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ReceiptText } from 'lucide-react';
import { triggerPushAllPayments } from '@/lib/actions/tally-sync';
import { toast } from 'react-hot-toast';

export function TallyPushPaymentsButton() {
  const [loading, setLoading] = useState(false);

  async function handlePush() {
    setLoading(true);
    try {
      const res = await triggerPushAllPayments('admin');
      if (res.success) {
        toast.success(`Queued ${res.queued} payment entries to Tally.`);
      } else {
        toast.error(`Sync Failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handlePush}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all flex items-center gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
      Sync Payments
    </Button>
  );
}
