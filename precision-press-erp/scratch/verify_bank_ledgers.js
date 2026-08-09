const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read env variables from .env.local
const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function checkBankConnections() {
  const { data: bankAccounts, error: bankErr } = await supabase
    .from('bank_account')
    .select('id, account_name, account_type, chart_account_id, organization_id');

  if (bankErr) {
    console.error("Error querying bank_account:", bankErr);
    return;
  }

  console.log(`Found ${bankAccounts.length} bank account(s) in database:\n`);

  for (const b of bankAccounts) {
    if (!b.chart_account_id) {
      console.log(`⚠️ Bank Account "${b.account_name}" (ID: ${b.id}) has NO linked chart_account_id!`);
    } else {
      const { data: acct, error: acctErr } = await supabase
        .from('chart_account')
        .select('id, code, name, type, sub_type')
        .eq('id', b.chart_account_id)
        .single();

      if (acctErr || !acct) {
        console.log(`❌ Bank Account "${b.account_name}" linked to INVALID chart_account_id: ${b.chart_account_id}`);
      } else {
        console.log(`✅ Bank Account "${b.account_name}" ➔ Linked to Ledger "${acct.code} - ${acct.name}" (${acct.type} / ${acct.sub_type})`);
      }
    }
  }
}

checkBankConnections();
