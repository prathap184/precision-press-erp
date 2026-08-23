const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyBankAccounts() {
  const { data } = await supabase.from('bank_account').select('account_name, balance, chart_account(*)');
  console.log('Bank Accounts in DB:');
  for (const b of data) {
    console.log(`- ${b.account_name}: Balance = ₹${(b.balance / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Linked GL: ${b.chart_account?.name} (Op: ₹${b.chart_account?.opening_balance} ${b.chart_account?.opening_balance_type})`);
  }
}

verifyBankAccounts();
