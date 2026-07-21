'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReceiptText, Loader2 } from 'lucide-react';
import { triggerPushAllReceipts } from '@/lib/actions/tally-sync';
import { toast } from 'react-hot-toast';

export function TallyPushReceiptsButton() {
  const [loading, setLoading] = useState(false);

  const handlePush = async () => {
    if (!confirm('Push all recent Receipt entries to Tally? (last 100)')) return;

    setLoading(true);
    try {
      const result = await triggerPushAllReceipts('admin');
      if (result.success) {
        toast.success(`Queued ${result.queued} receipts for Tally sync!`);
      } else {
        toast.error(`Failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error('An error occurred while pushing receipts.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePush}
      disabled={loading}
      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all flex items-center gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
      Sync Receipts
    </Button>
  );
}
