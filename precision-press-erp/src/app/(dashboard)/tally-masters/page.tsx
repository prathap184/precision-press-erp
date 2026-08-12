import React from 'react';
import { Metadata } from 'next';
import { getTallyMastersFromQueue } from '@/lib/actions/tally-sync';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { Users, Building2, Landmark, Wallet, CircleDollarSign, AlertCircle } from 'lucide-react';
import { TallyFetchMastersButton } from '../tally/tally-fetch-masters-button';

export const metadata: Metadata = {
  title: 'Tally Masters',
};

// Revalidate occasionally, but masters don't change every second
export const revalidate = 60;

export default async function TallyMastersPage() {
  const { fetchedAt, ledgers } = await getTallyMastersFromQueue();

  const customers = ledgers.filter((l) => l.parent === 'Sundry Debtors');
  const suppliers = ledgers.filter((l) => l.parent === 'Sundry Creditors');
  const banks = ledgers.filter((l) => l.parent === 'Bank Accounts');
  const cash = ledgers.filter((l) => l.parent === 'Cash-in-hand' || l.parent === 'Cash-in-Hand');
  const taxes = ledgers.filter((l) => l.parent.toLowerCase().includes('tax') || l.parent.toLowerCase().includes('duties'));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Tally Masters</h1>
          <p className="text-slate-500 mt-2 text-lg">
            View ledgers synchronized directly from TallyPrime.
          </p>
          {fetchedAt ? (
            <p className="text-sm text-slate-400 mt-1">
              Last synchronized: {formatDistanceToNow(new Date(fetchedAt), { addSuffix: true })}
            </p>
          ) : (
            <p className="text-sm text-amber-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> No data fetched yet. Click "Pull Customers/Suppliers" below.
            </p>
          )}
        </div>
        <div>
          <TallyFetchMastersButton />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard title="Customers" count={customers.length} icon={Users} color="bg-blue-100 text-blue-700" />
        <StatCard title="Suppliers" count={suppliers.length} icon={Building2} color="bg-purple-100 text-purple-700" />
        <StatCard title="Bank Accounts" count={banks.length} icon={Landmark} color="bg-emerald-100 text-emerald-700" />
        <StatCard title="Cash Accounts" count={cash.length} icon={Wallet} color="bg-amber-100 text-amber-700" />
        <StatCard title="Tax Ledgers" count={taxes.length} icon={CircleDollarSign} color="bg-rose-100 text-rose-700" />
      </div>

      <div className="space-y-6">
        <LedgerSection title="Customers (Sundry Debtors)" ledgers={customers} emptyText="No customers found in Tally." />
        <LedgerSection title="Suppliers (Sundry Creditors)" ledgers={suppliers} emptyText="No suppliers found in Tally." />
        <LedgerSection title="Bank Accounts" ledgers={banks} emptyText="No bank accounts found in Tally." />
        <LedgerSection title="Taxes & Duties" ledgers={taxes} emptyText="No tax ledgers found in Tally." />
        <LedgerSection title="Cash Accounts" ledgers={cash} emptyText="No cash accounts found in Tally." />
      </div>
    </div>
  );
}

function StatCard({ title, count, icon: Icon, color }: { title: string; count: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{count}</p>
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </CardContent>
    </Card>
  );
}

function LedgerSection({ title, ledgers, emptyText }: { title: string; ledgers: any[]; emptyText: string }) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="secondary" className="font-mono">{ledgers.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {ledgers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">{emptyText}</div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {ledgers.map((l, i) => (
              <div key={i} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                <div>
                  <h3 className="font-semibold text-slate-900">{l.name}</h3>
                  {l.aliases && l.aliases.length > 0 && (
                    <p className="text-sm text-slate-500 mt-0.5">Aliases: {l.aliases.join(', ')}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  {l.gstin && <Badge variant="outline" className="text-slate-600 bg-slate-50 font-mono">GST: {l.gstin}</Badge>}
                  {l.state && <span className="bg-slate-100 px-2 py-1 rounded text-xs">{l.state}</span>}
                  {l.isBillWise === 'Yes' && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0">Bill-wise Tracking</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
