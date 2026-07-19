import React from 'react';
import { getContraRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';

export default async function ContraRegisterPage() {
  const transactions = await getContraRegister();

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
