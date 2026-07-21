const fs = require('fs');
const path = 'src/lib/actions/accounts.ts';
let code = fs.readFileSync(path, 'utf8');

const regex = /  \/\/ 1\.b\. Update Treasury Ledger for Contra[\s\S]*?userId: authUser\.id\n  \}\);/;
const replacement = `  // 1.b. Update Treasury Ledger for Contra
  await updateTreasuryLedger({
    transactionType: 'CONTRA',
    referenceId: contraId,
    amount: amount,
    mode: 'CONTRA',
    flow: transferType === 'CASH_TO_BANK' ? 'CASH_TO_BANK' : 'BANK_TO_CASH',
    remarks: remarks,
    userId: authUser.id
  });

  // Fetch previous balances
  const cashLedgerName = transferType === 'CASH_TO_BANK' ? source_ledger : target_ledger;
  const bankLedgerName = transferType === 'CASH_TO_BANK' ? target_ledger : source_ledger;

  const { data: lastCash } = await supabaseServer.from('company_cash_ledger')
    .select('balance_after').eq('cash_ledger_name', cashLedgerName)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const balBeforeCash = Number(lastCash?.balance_after || 0);

  const { data: lastBank } = await supabaseServer.from('company_bank_ledger')
    .select('balance_after').eq('bank_ledger_name', bankLedgerName)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const balBeforeBank = Number(lastBank?.balance_after || 0);

  const dateStr = contraDate || new Date().toISOString().split('T')[0];

  if (transferType === 'CASH_TO_BANK') {
    await Promise.all([
      supabaseServer.from('company_cash_ledger').insert({
        entry_date: dateStr, cash_ledger_name: cashLedgerName, type: 'OUT',
        amount: amount, balance_before: balBeforeCash, balance_after: Math.max(0, balBeforeCash - amount),
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: \`Contra | \${remarks || ''}\`, created_by: authUser.name || authUser.id
      }),
      supabaseServer.from('company_bank_ledger').insert({
        entry_date: dateStr, bank_ledger_name: bankLedgerName, type: 'IN',
        amount: amount, balance_before: balBeforeBank, balance_after: balBeforeBank + amount,
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: \`Contra | \${remarks || ''}\`, created_by: authUser.name || authUser.id
      })
    ]);
  } else {
    // BANK_TO_CASH
    await Promise.all([
      supabaseServer.from('company_bank_ledger').insert({
        entry_date: dateStr, bank_ledger_name: bankLedgerName, type: 'OUT',
        amount: amount, balance_before: balBeforeBank, balance_after: Math.max(0, balBeforeBank - amount),
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: \`Contra | \${remarks || ''}\`, created_by: authUser.name || authUser.id
      }),
      supabaseServer.from('company_cash_ledger').insert({
        entry_date: dateStr, cash_ledger_name: cashLedgerName, type: 'IN',
        amount: amount, balance_before: balBeforeCash, balance_after: balBeforeCash + amount,
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: \`Contra | \${remarks || ''}\`, created_by: authUser.name || authUser.id
      })
    ]);
  }`;

// Windows CRLF
const targetRegexCRLF = /  \/\/ 1\.b\. Update Treasury Ledger for Contra[\s\S]*?userId: authUser\.id\r\n  \}\);/;

if (targetRegexCRLF.test(code)) {
  code = code.replace(targetRegexCRLF, replacement.replace(/\n/g, '\r\n'));
  fs.writeFileSync(path, code);
  console.log('SUCCESS CRLF');
} else if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync(path, code);
  console.log('SUCCESS');
} else {
  console.log('NOT FOUND');
}
