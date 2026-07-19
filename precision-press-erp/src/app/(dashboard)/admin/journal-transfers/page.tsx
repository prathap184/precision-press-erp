import React from 'react';
import { getJournalRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';

export default async function JournalRegisterPage() {
  const transactions = await getJournalRegister();

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
