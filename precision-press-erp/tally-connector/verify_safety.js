const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyMasterDataSafety() {
  console.log('=== VERIFYING MASTER DATA INTEGRITY ===');
  
  const { data: cust } = await supabase.from('contact').select('id').eq('type', 'customer');
  const { data: supp } = await supabase.from('contact').select('id').eq('type', 'supplier');
  const { data: bank } = await supabase.from('bank_account').select('id');
  const { data: gl }   = await supabase.from('chart_account').select('id');
  const { data: itm }  = await supabase.from('inventory_item').select('id');
  const { data: cat }  = await supabase.from('inventory_category').select('id');
  const { data: je }   = await supabase.from('journal_entry').select('id');

  console.log(`• Customers preserved:     ${cust?.length || 0} / 1260`);
  console.log(`• Suppliers preserved:     ${supp?.length || 0} / 133`);
  console.log(`• Bank Accounts preserved: ${bank?.length || 0} / 3`);
  console.log(`• GL Accounts preserved:   ${gl?.length || 0} / 221`);
  console.log(`• Stock Items preserved:   ${itm?.length || 0} / 582`);
  console.log(`• Stock Groups preserved:  ${cat?.length || 0} / 183`);
  console.log(`• Test Journal Entries:    ${je?.length || 0} (Clean Slate!)`);
}

verifyMasterDataSafety();
