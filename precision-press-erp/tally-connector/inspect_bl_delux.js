const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ITEMS_XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml');

async function inspectBlDelux() {
  const { data, error } = await supabase
    .from('inventory_item')
    .select('*')
    .ilike('name', '%BL Delux%');

  console.log('DB Record for BL Delux:', data);

  const xml = fs.readFileSync(ITEMS_XML_PATH, 'utf8');
  const regex = /<STOCKITEM NAME="[^"]*BL Delux[^"]*"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    console.log('\n=== TALLY XML FOR BL DELUX ===');
    console.log(m[0]);
  }
}

inspectBlDelux();
