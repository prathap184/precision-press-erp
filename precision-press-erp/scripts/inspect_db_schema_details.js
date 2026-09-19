const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61:8000',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkColumns() {
  const { data: bankCols, error: bErr } = await supabase.rpc('get_table_columns_debug', {});
  // If no RPC, let's query sample row
  const { data: bSample } = await supabase.from('bank_account').select('*').limit(1);
  console.log('Bank account keys:', Object.keys(bSample?.[0] || {}));
  console.log('Bank sample:', bSample?.[0]);

  const { data: cSample } = await supabase.from('chart_account').select('*').limit(1);
  console.log('Chart account keys:', Object.keys(cSample?.[0] || {}));
  console.log('Chart sample:', cSample?.[0]);
}

checkColumns();
