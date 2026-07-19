import React from 'react';
import { getSalesRegister } from '@/lib/actions/registers';
import { TransactionList } from '@/components/accounting/TransactionList';

export default async function SalesRegisterPage() {
  const transactions = await getSalesRegister();

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
