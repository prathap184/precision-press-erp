const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyItem() {
  const { data: item, error } = await supabase
    .from('inventory_item')
    .select('id, name, code, sku, category, category_id, workflow_steps')
    .ilike('name', '%03 Acrylic Sheet 3mm%')
    .single();

  if (error) {
    console.error(error);
    return;
  }

  console.log('=== VERIFICATION FOR "03 Acrylic Sheet 3mm ~2.5mm- A3" ===');
  console.log('Code:          ', item.code);
  console.log('SKU:           ', item.sku);
  console.log('Category Name: ', item.category);
  console.log('Category ID:   ', item.category_id);
  console.log('Workflow Steps Count: ', item.workflow_steps?.length || 0);
  console.log('Workflow Steps:', JSON.stringify(item.workflow_steps, null, 2));
}

verifyItem();
