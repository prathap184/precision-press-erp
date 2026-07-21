import React from 'react';
import { Metadata } from 'next';
import { getTallySyncEventsForDashboard } from '@/lib/actions/tally-sync';
import { TallyQueueTable } from './tally-queue-table';
import { TallyFetchMastersButton } from './tally-fetch-masters-button';
import { TallyPushMastersButton } from './tally-push-masters-button';
import { TallyPushInvoicesButton } from './tally-push-invoices-button';
import { TallyPushCustomersButton } from './tally-push-customers-button';
import { TallyPushReceiptsButton } from './tally-push-receipts-button';
import { TallyPushPaymentsButton } from './tally-push-payments-button';
import { TallyPushContraButton } from './tally-push-contra-button';
import { TallyPushJournalButton } from './tally-push-journal-button';

export const metadata: Metadata = {
  title: 'Tally Connector Dashboard',
};

// Revalidate every 5 seconds since it's a queue monitor
export const revalidate = 5;

export default async function TallyDashboardPage() {
  const events = await getTallySyncEventsForDashboard(100);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Tally Sync Dashboard</h1>
          <p className="text-slate-500 mt-2 text-lg">Monitor live data synchronization between the ERP and TallyPrime</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <TallyPushInvoicesButton />
          <TallyPushReceiptsButton />
          <TallyPushPaymentsButton />
          <TallyPushContraButton />
          <TallyPushJournalButton />
          <TallyPushCustomersButton />
          <TallyPushMastersButton />
          <TallyFetchMastersButton />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <TallyQueueTable initialEvents={events} />
      </div>
    </div>
  );
}
