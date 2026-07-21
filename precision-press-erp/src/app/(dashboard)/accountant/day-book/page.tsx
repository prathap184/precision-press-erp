import React from 'react';
import { getDayBook } from '@/lib/actions/registers';
import { DayBookClient } from '@/components/accounting/DayBookClient';
import { format } from 'date-fns';

export default async function DayBookPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  const from = searchParams.from === 'all' ? undefined : (searchParams.from || format(new Date(), 'yyyy-MM-dd'));
  const to = searchParams.to === 'all' ? undefined : (searchParams.to || format(new Date(), 'yyyy-MM-dd'));
  
  const { rows, openingBalance } = await getDayBook(from, to);
  return <DayBookClient rows={rows} serverOpeningBalance={openingBalance} />;
}
