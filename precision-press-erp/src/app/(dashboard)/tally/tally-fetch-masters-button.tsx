'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { triggerFetchMasters } from '@/lib/actions/tally-sync';
import { useAuth } from '@/lib/auth-context';

export function TallyFetchMastersButton() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await triggerFetchMasters(user.uid);
      if (res.success) {
        alert('Master sync queued! Ensure Tally Connector is running.');
      } else {
        alert('Failed to queue master sync.');
      }
    } catch (err) {
      console.error(err);
      alert('Error queuing master sync.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleFetch} 
      disabled={loading}
      variant="outline"
      className="gap-2"
    >
      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Queuing...' : 'Pull Customers/Suppliers from Tally'}
    </Button>
  );
}
