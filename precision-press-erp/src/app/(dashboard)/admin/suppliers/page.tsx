import React from 'react';
import { getSupplierLedgerSummaries } from '@/lib/actions/suppliers';
import { Metadata } from 'next';
import { SupplierListClient } from './SupplierListClient';

import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Supplier Ledgers | Admin Dashboard',
};

export default async function SuppliersPage() {
  const suppliers = await getSupplierLedgerSummaries();

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Supplier Ledgers</h1>
          <p className="text-sm text-slate-500">Live synchronized balances from Tally</p>
        </div>
        <Link href="/admin/suppliers/create" className="bg-indigo-600 text-white px-4 py-2 rounded font-bold shadow hover:bg-indigo-700">
          + Add Supplier
        </Link>
      </div>

      <SupplierListClient initialSuppliers={suppliers} />
    </div>
  );
}
