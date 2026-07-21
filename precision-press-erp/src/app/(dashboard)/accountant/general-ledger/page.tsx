import { getGeneralLedger } from '@/lib/actions/registers';
import { GeneralLedgerClient } from '@/components/accounting/GeneralLedgerClient';
import React from 'react';
import { format } from 'date-fns';

export default async function GeneralLedgerPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));

  const { rows, openingBalance } = await getGeneralLedger(from, to, 'ALL');

  return (
    <GeneralLedgerClient 
      entries={rows} 
      title="General Ledger" 
      subtitle="View all transactions across all ledgers" 
      serverOpeningBalance={openingBalance}
    />
  );
}
