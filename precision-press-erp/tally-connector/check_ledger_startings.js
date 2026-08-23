const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkLedgers() {
  const { data: banks } = await supabase.from('bank_account').select('id, account_name, balance, chart_account_id, chart_account(*)');

  console.log('=== BANK ACCOUNTS & LEDGER STARTING BALANCES ===');
  for (const b of banks) {
    const directOpBal = Number(b.chart_account?.opening_balance || 0);
    const opType = b.chart_account?.opening_balance_type || 'Dr';
    const cents = b.balance;
    const rupeeBal = cents / 100;

    console.log(`\n🏦 ${b.account_name}:`);
    console.log(`   - Bank Live Balance: ₹${rupeeBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${rupeeBal >= 0 ? 'Dr' : 'Cr'})`);
    console.log(`   - Linked GL Account: ${b.chart_account?.name} (Code: ${b.chart_account?.code})`);
    console.log(`   - GL Opening Balance: ₹${directOpBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${opType}`);
  }
}

checkLedgers();
