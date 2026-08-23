const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCategoriesAndSKU() {
  const { data: items, error } = await supabase
    .from('inventory_item')
    .select('id, name, category, category_id, sku, workflow_steps')
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Sample 10 items in DB:');
  console.log(JSON.stringify(items, null, 2));

  const { data: nullCatCount } = await supabase
    .from('inventory_item')
    .select('id', { count: 'exact' })
    .is('category_id', null);

  console.log('Items with NULL category_id:', nullCatCount?.length || 0);

  const { data: nullSkuCount } = await supabase
    .from('inventory_item')
    .select('id', { count: 'exact' })
    .is('sku', null);

  console.log('Items with NULL sku:', nullSkuCount?.length || 0);

  const { data: allCategories } = await supabase
    .from('inventory_category')
    .select('id, name');

  console.log(`Total categories in DB: ${allCategories?.length || 0}`);
}

checkCategoriesAndSKU();
