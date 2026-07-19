import { supabaseServer } from '@/lib/supabase-server';
import Link from 'next/link';
import { format } from 'date-fns';
import { Building2, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';

export default async function BankLedgerListPage() {
  // Get all unique bank ledger names and their latest balance
  const { data: bankRows } = await supabaseServer
    .from('company_bank_ledger')
    .select('bank_ledger_name, balance_after, entry_date')
    .order('created_at', { ascending: false });

  // Group by bank_ledger_name — take latest balance_after
  const bankMap = new Map<string, { balance: number; lastDate: string }>();
  for (const row of bankRows || []) {
    if (!bankMap.has(row.bank_ledger_name)) {
      bankMap.set(row.bank_ledger_name, {
        balance: Number(row.balance_after || 0),
        lastDate: row.entry_date
      });
    }
  }

  // Also get bank accounts list for opening balances
  const { data: bankAccounts } = await supabaseServer
    .from('bankAccounts')
    .select('label, opening_balance, accountNumber, ifsc');

  const banks = Array.from(bankMap.entries()).map(([name, info]) => ({
    name,
    balance: info.balance,
    lastDate: info.lastDate
  }));

  // If no ledger entries yet, show bank accounts
  const displayBanks = banks.length > 0 ? banks : (bankAccounts || []).map(b => ({
    name: b.label,
    balance: Number(b.opening_balance || 0),
    lastDate: null,
    accountNumber: b.accountNumber,
    ifsc: b.ifsc
  }));

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center gap-3">
          <Building2 className="text-blue-500" size={20} />
          <h1 className="text-lg font-bold text-slate-800">Bank Ledgers</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-3">
        {displayBanks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Building2 className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="text-slate-500 font-medium">No bank ledger entries yet</p>
            <p className="text-slate-400 text-sm mt-1">Bank entries appear here after receipts or payments are saved</p>
          </div>
        ) : (
          displayBanks.map((bank) => (
            <Link
              key={bank.name}
              href={`/accountant/bank-ledger/${encodeURIComponent(bank.name)}`}
              className="block bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Building2 className="text-blue-500" size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-lg">{bank.name}</p>
                    {bank.lastDate && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Last entry: {format(new Date(bank.lastDate), 'dd MMM yyyy')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Balance</p>
                    <p className={`text-xl font-bold ${bank.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      ₹{Math.abs(bank.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <ChevronRight className="text-slate-300" size={20} />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
