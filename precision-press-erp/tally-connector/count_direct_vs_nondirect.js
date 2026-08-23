const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getCounts() {
  const { data: items, error } = await supabase
    .from('inventory_item')
    .select('id, name, unit_of_measure, tally_uom, category, metadata');

  if (error) {
    console.error(error);
    return;
  }

  let directCount = 0;
  let nonDirectCount = 0;
  const directCategories = {};
  const nonDirectCategories = {};

  items.forEach(it => {
    const isDirect = it.metadata?.isDirectSelling === true;
    const cat = it.category || 'Uncategorized';
    if (isDirect) {
      directCount++;
      directCategories[cat] = (directCategories[cat] || 0) + 1;
    } else {
      nonDirectCount++;
      nonDirectCategories[cat] = (nonDirectCategories[cat] || 0) + 1;
    }
  });

  console.log('=== EXACT BREAKDOWN IN DATABASE ===');
  console.log(`Total Items: ${items.length}`);
  console.log(`Direct Selling Items:     ${directCount}`);
  console.log(`Non-Direct Selling Items: ${nonDirectCount}`);
  
  console.log('\nTop Categories in Direct Selling:');
  console.log(Object.entries(directCategories).sort((a,b)=>b[1]-a[1]).slice(0, 10));

  console.log('\nTop Categories in Non-Direct Selling:');
  console.log(Object.entries(nonDirectCategories).sort((a,b)=>b[1]-a[1]).slice(0, 10));
}

getCounts();
