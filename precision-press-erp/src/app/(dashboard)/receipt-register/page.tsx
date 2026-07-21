import React from 'react';
import { getReceiptRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';
import { format } from 'date-fns';

export default async function ReceiptRegisterPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));
  
  const transactions = await getReceiptRegister(from, to);

  return (
    <TransactionList 
      title="Receipt Register" 
      transactions={transactions} 
      emptyMessage="No receipts found."
      newActionHref="/receipt-entry"
      newActionLabel="Add Receipt"
    />
  );
}
