const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectItem() {
  const { data, error } = await supabase
    .from('inventory_item')
    .select('*')
    .eq('id', '34d99078-bd35-4616-b6b8-f3977ad49f19')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Item 34d99078-bd35-4616-b6b8-f3977ad49f19:');
  console.log(JSON.stringify(data, null, 2));
}

inspectItem();
