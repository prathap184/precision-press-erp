const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkContactCols() {
  const { data, error } = await supabase.from('contact').select('*').limit(1);
  if (error) {
    console.error(error);
    return;
  }
  console.log('Columns in public.contact:');
  console.log(Object.keys(data[0] || {}));
}

checkContactCols();
