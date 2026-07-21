import React from 'react';
import { getJournalRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';
import { format } from 'date-fns';

export default async function JournalRegisterPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));

  const transactions = await getJournalRegister(from, to);

  return (
    <div className="p-6">
      <TransactionList 
        title="Journal Entries" 
        transactions={transactions as any} 
        emptyMessage="No journal entries found."
        newActionHref="/admin/journal-transfers/create"
        newActionLabel="Add Journal Entry"
      />
    </div>
  );
}
