import { getGeneralLedger } from '@/lib/actions/registers';
import { GeneralLedgerClient } from '@/components/accounting/GeneralLedgerClient';
import React from 'react';
import { format } from 'date-fns';

export default async function CashLedgerPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));
  
  const { rows, openingBalance } = await getGeneralLedger(from, to, 'CASH');

  return (
    <GeneralLedgerClient 
      entries={rows} 
      title="Cash Ledger" 
      subtitle="View all cash transactions" 
      serverOpeningBalance={openingBalance}
    />
  );
}
