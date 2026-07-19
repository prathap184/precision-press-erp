import React from 'react';
import { HSNService } from '@/services/hsnService';
import HSNMasterClient from './HSNMasterClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'HSN Master | PIXEL MARKETING ERP',
};

export default async function HSNMasterPage() {
  // Fetch initial data server-side
  const activeHSNs = await HSNService.getActiveHSNs();

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HSN Master</h1>
          <p className="text-muted-foreground text-sm">
            Manage HSN codes and their corresponding GST rates.
          </p>
        </div>
      </div>
      <HSNMasterClient initialData={activeHSNs} />
    </div>
  );
}
