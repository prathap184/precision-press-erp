import { getGeneralLedger } from '@/lib/actions/registers';
import { GeneralLedgerClient } from '@/components/accounting/GeneralLedgerClient';
import React from 'react';
import { format } from 'date-fns';

export default async function BankLedgerPage({ params, searchParams }: { params: { name: string }, searchParams: { from?: string, to?: string } }) {
  const bankName = decodeURIComponent(params.name);
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));
  
  const { rows, openingBalance } = await getGeneralLedger(from, to, 'BANK', bankName);

  return (
    <GeneralLedgerClient 
      entries={rows} 
      title={`${bankName} Ledger`} 
      subtitle={`View all transactions for ${bankName}`} 
      serverOpeningBalance={openingBalance}
    />
  );
}
