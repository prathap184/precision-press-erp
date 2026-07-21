'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRightLeft } from 'lucide-react';
import { triggerPushAllContra } from '@/lib/actions/tally-sync';
import { toast } from 'react-hot-toast';

export function TallyPushContraButton() {
  const [loading, setLoading] = useState(false);

  async function handlePush() {
    setLoading(true);
    try {
      const res = await triggerPushAllContra('admin');
      if (res.success) {
        toast.success(`Queued ${res.queued} contra entries to Tally.`);
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
      className="bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-sm transition-all flex items-center gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
      Sync Contra
    </Button>
  );
}
