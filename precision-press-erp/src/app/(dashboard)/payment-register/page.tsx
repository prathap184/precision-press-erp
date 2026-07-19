import React from 'react';
import { getPaymentRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';

export default async function PaymentRegisterPage() {
  const transactions = await getPaymentRegister();

  return (
    <TransactionList 
      title="Payment Entry" 
      transactions={transactions} 
      emptyMessage="No payment entries found."
      newActionHref="/payment-entry"
      newActionLabel="Add Payment Entry"
    />
  );
}
