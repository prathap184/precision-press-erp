'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UploadCloud } from 'lucide-react';
import { triggerPushAllMasters } from '@/lib/actions/tally-sync';
import { useAuth } from '@/lib/auth-context';

export function TallyPushMastersButton() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePush = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await triggerPushAllMasters(user.uid);
      if (res.success) {
        alert(`Successfully queued ${res.queued} masters for push to Tally!`);
      } else {
        alert(`Failed to queue master push: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error queuing master push.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={handlePush} 
      disabled={loading}
      variant="default"
      className="gap-2"
    >
      <UploadCloud className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
      {loading ? 'Queuing Push...' : 'Push All Masters to Tally'}
    </Button>
  );
}
