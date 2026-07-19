import React from 'react';
import { getGeneralLedger } from '@/lib/actions/registers';
import { GeneralLedgerClient } from '@/components/accounting/GeneralLedgerClient';
import { supabaseServer } from '@/lib/supabase-server';

interface Props {
  params: {
    name: string;
  };
}

export default async function BankLedgerDetailPage({ params }: Props) {
  const bankName = decodeURIComponent(params.name);
  const allEntries = await getGeneralLedger();
  
  // Filter for only this bank's entries.
  const bankEntries = allEntries.filter(
    e => e.paymentMode !== 'CASH' && e.bankLedger === bankName
  );

  // Fetch opening balance
  const { data: bankAccounts } = await supabaseServer
    .from('bankAccounts')
    .select('opening_balance')
    .eq('bank_name', bankName)
    .single();

  const openingBalance = Number(bankAccounts?.opening_balance) || 0;

  return (
    <GeneralLedgerClient 
      entries={bankEntries} 
      title={`Bank Ledger: ${bankName}`} 
      subtitle={`Unified chronological view of all transactions for ${bankName}.`}
      showSummary={true}
      openingBalance={openingBalance}
    />
  );
}
