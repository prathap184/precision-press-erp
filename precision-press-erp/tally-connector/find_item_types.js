const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findExamples() {
  const { data: directItems } = await supabase
    .from('inventory_item')
    .select('id, name, code, sku, purchase_price, sale_price, metadata, category, unit_of_measure')
    .eq('metadata->>isDirectSelling', 'true')
    .limit(5);

  const { data: nonDirectItems } = await supabase
    .from('inventory_item')
    .select('id, name, code, sku, purchase_price, sale_price, metadata, category, unit_of_measure')
    .eq('metadata->>isDirectSelling', 'false')
    .limit(5);

  console.log('=== DIRECT SELLING (Piece / Unit based) ===');
  console.log(directItems);

  console.log('\n=== NON-DIRECT SELLING (Custom Sq.Ft / Area based) ===');
  console.log(nonDirectItems);
}

findExamples();
