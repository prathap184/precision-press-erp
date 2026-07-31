import React from 'react';
import { getQuotationRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';
import { format } from 'date-fns';

export default async function QuotationRegisterPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));
  
  const transactions = await getQuotationRegister(from, to);

  return (
    <TransactionList 
      title="Quotations Register" 
      transactions={transactions} 
      emptyMessage="No quotations found."
      newActionHref="/quotation-builder"
      newActionLabel="Create Quotation"
    />
  );
}
