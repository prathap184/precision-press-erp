const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectBankGL() {
  const { data: banks } = await supabase
    .from('bank_account')
    .select('id, account_name, chart_account_id, balance, tally_ledger_name');

  console.log('Bank Accounts & linked Chart Accounts:');
  for (const b of (banks || [])) {
    let glName = 'None';
    if (b.chart_account_id) {
      const { data: gl } = await supabase
        .from('chart_account')
        .select('id, code, name')
        .eq('id', b.chart_account_id)
        .single();
      if (gl) glName = `${gl.code} - ${gl.name}`;
    }
    console.log(`🏦 ${b.account_name.padEnd(20)} -> GL: ${glName.padEnd(30)} | Balance: ₹${(b.balance / 100).toFixed(2)}`);
  }
}

inspectBankGL();
