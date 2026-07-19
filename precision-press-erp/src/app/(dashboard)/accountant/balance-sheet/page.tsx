export const dynamic = 'force-dynamic';

import { supabaseServer } from '@/lib/supabase-server';
import { getGeneralLedger } from '@/lib/actions/registers';
import { BalanceSheetClient } from '@/components/accounting/BalanceSheetClient';
import React from 'react';

export default async function BalanceSheetPage() {
  // 1. Fetch total opening balance
  const { data: bankAccounts } = await supabaseServer
    .from('bankAccounts')
    .select('opening_balance');

  const totalOpeningBalance = (bankAccounts || []).reduce(
    (sum, acc) => sum + (Number(acc.opening_balance) || 0),
    0
  );

  // 2. Fetch all entries from General Ledger
  const allEntries = await getGeneralLedger();

  return (
    <BalanceSheetClient 
      allEntries={allEntries} 
      totalOpeningBalance={totalOpeningBalance} 
    />
  );
}
