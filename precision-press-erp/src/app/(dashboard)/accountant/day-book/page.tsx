import React from 'react';
import { getDayBook } from '@/lib/actions/registers';
import { DayBookClient } from '@/components/accounting/DayBookClient';

export default async function DayBookPage() {
  const rows = await getDayBook();
  return <DayBookClient rows={rows} />;
}
