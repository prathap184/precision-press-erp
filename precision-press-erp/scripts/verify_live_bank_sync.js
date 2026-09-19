const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
  const { data: banks } = await supabase
    .from('bank_account')
    .select('id, account_name, bank_name, account_number, account_type, balance, tally_ledger_name, tally_guid, chart_account_id, chart_account(code, name, opening_balance, tally_guid)')
    .order('account_name', { ascending: true });

  console.log('=== 🏦 LIVE ERP BANK ACCOUNTS IN DATABASE ===');
  banks.forEach((b, i) => {
    console.log(`\n[#${i+1}] ${b.account_name}`);
    console.log(`   • Bank Name       : ${b.bank_name}`);
    console.log(`   • Account Number  : ${b.account_number}`);
    console.log(`   • Type            : ${b.account_type}`);
    console.log(`   • Tally Ledger    : ${b.tally_ledger_name}`);
    console.log(`   • Tally GUID      : ${b.tally_guid}`);
    console.log(`   • Balance in Paise: ${b.balance}`);
    console.log(`   • Balance in ₹    : ₹${(Number(b.balance) / 100).toLocaleString('en-IN')}`);
    console.log(`   • Linked GL Code  : ${b.chart_account?.code} (${b.chart_account?.name})`);
    console.log(`   • GL Opening Bal  : ₹${Number(b.chart_account?.opening_balance).toLocaleString('en-IN')}`);
    console.log(`   • GUID Match      : ${b.tally_guid === b.chart_account?.tally_guid ? '✅ 100% IDENTICAL' : '❌ MISMATCH'}`);
  });
}
verify();
