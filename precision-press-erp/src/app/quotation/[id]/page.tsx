import React from 'react';
import { getQuotationById } from '@/lib/actions/quotations';
import { QuotationViewer } from './QuotationViewer';

export default async function QuotationPage({ params }: { params: { id: string } }) {
  const quotation = await getQuotationById(params.id);

  if (!quotation) {
    return <div className="p-12 text-center text-slate-500">Quotation not found.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <QuotationViewer quotation={quotation} />
      </div>
    </div>
  );
}
