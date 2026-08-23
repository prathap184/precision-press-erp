const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectColumns() {
  const { data: coa } = await supabase.from('chart_account').select('*').limit(1);
  if (coa && coa[0]) {
    console.log('chart_account existing columns:', Object.keys(coa[0]));
  }
  const { data: bank } = await supabase.from('bank_account').select('*').limit(1);
  if (bank && bank[0]) {
    console.log('bank_account existing columns:', Object.keys(bank[0]));
  }
}
inspectColumns();
