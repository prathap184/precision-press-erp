import React from 'react';
import { getPaymentRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';

export default async function PaymentRegisterPage() {
  const transactions = await getPaymentRegister();

  return (
    <div className="p-6">
      <TransactionList 
        title="Payment Entry" 
        transactions={transactions as any} 
        emptyMessage="No payment entries found."
        newActionHref="/payment-entry/create"
        newActionLabel="Add Payment Entry"
      />
    </div>
  );
}
