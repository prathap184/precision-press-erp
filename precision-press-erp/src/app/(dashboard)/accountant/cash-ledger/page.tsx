import React from 'react';
import { getGeneralLedger } from '@/lib/actions/registers';
import { GeneralLedgerClient } from '@/components/accounting/GeneralLedgerClient';

export default async function CashLedgerPage() {
  const allEntries = await getGeneralLedger();
  
  // Filter for only CASH entries
  const cashEntries = allEntries.filter(e => e.paymentMode === 'CASH');

  return (
    <GeneralLedgerClient 
      entries={cashEntries} 
      title="Cash Ledger" 
      subtitle="Unified chronological view of all cash transactions."
      showSummary={true}
    />
  );
}
