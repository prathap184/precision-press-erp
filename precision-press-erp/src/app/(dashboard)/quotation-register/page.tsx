import React from 'react';
import { getQuotationRegister } from '@/lib/actions/registers';
import { QuotationList } from '@/components/acdema/QuotationList';

export default async function QuotationRegisterPage() {
  const transactions = await getQuotationRegister();

  return (
    <div className="p-6">
      <QuotationList 
        title="Quotation" 
        quotations={transactions} 
        newActionHref="/admin/quotation-order"
        newActionLabel="Add Quotation"
      />
    </div>
  );
}
