const fs = require('fs');
const path = 'src/lib/actions/accounts.ts';
let code = fs.readFileSync(path, 'utf8');

const regex = /\/\/ Fetch previous balances[\s\S]*?created_by: authUser\.name \|\| authUser\.id\r?\n      \}\)\r?\n    \]\);\r?\n  \}/;

const replacement = `// Fetch previous balances
  const { data: lastCash } = await supabaseServer.from('company_cash_ledger')
    .select('balance_after, cash_ledger_name')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  
  const { data: lastBank } = await supabaseServer.from('company_bank_ledger')
    .select('balance_after, bank_ledger_name')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const balBeforeCash = Number(lastCash?.balance_after || 0);
  const cashLedgerName = lastCash?.cash_ledger_name || (transferType === 'CASH_TO_BANK' ? source_ledger : target_ledger);

  const balBeforeBank = Number(lastBank?.balance_after || 0);
  const bankLedgerName = lastBank?.bank_ledger_name || (transferType === 'CASH_TO_BANK' ? target_ledger : source_ledger);

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

if (regex.test(code)) {
  code = code.replace(regex, replacement.replace(/\n/g, '\r\n'));
  fs.writeFileSync(path, code);
  console.log('SUCCESS');
} else {
  console.log('NOT FOUND');
}
