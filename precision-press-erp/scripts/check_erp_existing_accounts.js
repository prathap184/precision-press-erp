const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61:8000',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDb() {
  const { data: coa, error: coaErr } = await supabase
    .from('chart_account')
    .select('id, code, name, type, sub_type, tally_guid, tally_ledger_name, is_system')
    .order('code', { ascending: true });

  const { data: banks, error: bErr } = await supabase
    .from('bank_account')
    .select('id, account_name, bank_name, tally_ledger_name, tally_guid, chart_account_id');

  console.log(`ERP has ${coa ? coa.length : 0} Chart of Accounts (System base).`);
  console.log(`ERP has ${banks ? banks.length : 0} Bank Accounts.`);
  if (banks) {
    banks.forEach(b => {
      console.log(`- Bank: "${b.account_name}" | Tally: "${b.tally_ledger_name}" | GUID: ${b.tally_guid} | Linked GL: ${b.chart_account_id}`);
    });
  }
}

checkDb();
