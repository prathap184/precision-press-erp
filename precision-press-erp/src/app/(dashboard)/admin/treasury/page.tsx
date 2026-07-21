import React from 'react';
import { getContraRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';
import { format } from 'date-fns';

export default async function ContraRegisterPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));

  const transactions = await getContraRegister(from, to);

  return (
    <div className="p-6">
      <TransactionList 
        title="Contra Entries" 
        transactions={transactions as any} 
        emptyMessage="No contra entries found."
        newActionHref="/admin/treasury/create"
        newActionLabel="Add Contra Entry"
      />
    </div>
  );
}
