import React from 'react';
import { getSalesRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';
import { format } from 'date-fns';

export default async function SalesRegisterPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));
  
  const transactions = await getSalesRegister(from, to);

  return (
    <TransactionList 
      title="Sales Invoice" 
      transactions={transactions} 
      emptyMessage="No sales invoices found."
      newActionHref="/admin/invoice-generation"
      newActionLabel="Add Sales Invoice"
    />
  );
}
