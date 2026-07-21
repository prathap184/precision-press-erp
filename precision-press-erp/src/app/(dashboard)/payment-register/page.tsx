import React from 'react';
import { getPaymentRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';
import { format } from 'date-fns';

export default async function PaymentRegisterPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));
  
  const transactions = await getPaymentRegister(from, to);

  return (
    <TransactionList 
      title="Payment Register" 
      transactions={transactions} 
      emptyMessage="No payments found."
      newActionHref="/admin/treasury/payments/new"
      newActionLabel="Add Payment"
    />
  );
}
