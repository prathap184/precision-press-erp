import React from 'react';
import { getReceiptRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';

export default async function ReceiptRegisterPage() {
  const transactions = await getReceiptRegister();

  return (
    <TransactionList 
      title="Receipt Entry" 
      transactions={transactions} 
      emptyMessage="No receipt entries found."
      newActionHref="/receipt-entry"
      newActionLabel="Add Receipt Entry"
    />
  );
}
