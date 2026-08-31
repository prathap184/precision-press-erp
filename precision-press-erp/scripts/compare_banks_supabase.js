// scripts/compare_banks_supabase.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function compare() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: erpBanks, error: bErr } = await supabase
    .from('bank_account')
    .select('id, account_name, account_number, bank_name, currency_code, current_balance, is_active')
    .is('deleted_at', null);

  const { data: erpChart, error: cErr } = await supabase
    .from('chart_account')
    .select('id, code, name, type, sub_type, is_active')
    .or('sub_type.ilike.%bank%,sub_type.ilike.%cash%,name.ilike.%bank%,name.ilike.%cash%')
    .is('deleted_at', null);

  console.log('=== 🏦 ERP BANK_ACCOUNT TABLE ===');
  console.table(erpBanks || []);

  console.log('\n=== 📊 ERP CHART OF ACCOUNTS (Bank & Cash) ===');
  console.table(erpChart || []);
}

compare().catch(console.error);
