const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyAll() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       🔍 FINAL VERIFICATION: BANK & CHART OF ACCOUNTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: banks } = await supabase.from('bank_account').select('*');
  console.log('🏦 OPERATIONAL BANK ACCOUNTS (in public.bank_account):');
  for (const b of banks) {
    const { data: gl } = await supabase.from('chart_account').select('code, name, type, tally_ledger_name, opening_balance').eq('id', b.chart_account_id).single();
    console.log(`   • ${b.account_name} | A/c: ${b.account_number} | Balance: ₹${Number(b.balance).toLocaleString('en-IN')}`);
    console.log(`     └─ 🔗 Linked GL: [${gl?.code}] ${gl?.name} | Tally: "${b.tally_ledger_name}" | GUID: ${b.tally_guid ? '✅ Present' : '❌'}`);
  }

  const { count: coaCount } = await supabase.from('chart_account').select('*', { count: 'exact', head: true });
  console.log(`\n📑 TOTAL GENERAL LEDGER ACCOUNTS (in public.chart_account): ${coaCount}`);

  const { data: majorGls } = await supabase
    .from('chart_account')
    .select('code, name, type, sub_type, tally_ledger_name, opening_balance, opening_balance_type')
    .in('code', ['1100', '1000', '1010', '3000', '3100', '2201', '1260', '4010', '5210', '5900', '6000', '6001', '6002'])
    .order('code');

  console.log('\n🌟 SAMPLE MAPPED & NEW GL ACCOUNTS:');
  majorGls.forEach(g => {
    console.log(`   • [${g.code}] ${g.name.padEnd(35)} | Type: ${g.type.padEnd(9)} | Tally: "${g.tally_ledger_name}" | Opening: ₹${Number(g.opening_balance).toLocaleString('en-IN')} (${g.opening_balance_type})`);
  });
}
verifyAll();
