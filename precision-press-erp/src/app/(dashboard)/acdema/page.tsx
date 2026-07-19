'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
export const dynamic = 'force-dynamic';
import { ProxyOrderBuilder } from '@/components/acdema/ProxyOrderBuilder';
import { AcdemaOrdersPanel } from '@/components/acdema/AcdemaOrdersPanel';

export default function AcdemaPage() {
  const searchParams = useSearchParams();
  const view = searchParams.get('view');
  const initialMode = view === 'passed' ? 'mine' : view === 'my-stage' ? 'stage' : 'global';

  return (
    <div className="space-y-6">
      {view === 'control' ? <ProxyOrderBuilder /> : <AcdemaOrdersPanel initialMode={initialMode} />}
    </div>
  );
}
