import React from 'react';
import { getGeneralLedger } from '@/lib/actions/registers';
import { GeneralLedgerClient } from '@/components/accounting/GeneralLedgerClient';

export default async function GeneralLedgerPage() {
  const entries = await getGeneralLedger();

  return (
    <GeneralLedgerClient 
      entries={entries} 
    />
  );
}
