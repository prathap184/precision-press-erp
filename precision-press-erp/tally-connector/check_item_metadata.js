const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkMetadata() {
  const { data, error } = await supabase
    .from('inventory_item')
    .select('id, name, unit_of_measure, tally_uom, metadata, sale_price, purchase_price')
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Sample 10 items metadata in DB:');
  console.log(JSON.stringify(data, null, 2));
}

checkMetadata();
