const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectColumns() {
  const { data: bank } = await supabase.from('bank_account').select('*').limit(1);
  const { data: cont } = await supabase.from('contact').select('*').limit(1);
  const { data: ca } = await supabase.from('chart_account').select('*').limit(1);

  console.log('bank_account columns:', Object.keys(bank?.[0] || {}));
  console.log('contact columns:', Object.keys(cont?.[0] || {}));
  console.log('chart_account columns:', Object.keys(ca?.[0] || {}));
}

inspectColumns();
