// scripts/check_all_bank_tables.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: b1 } = await supabase.from('bank_account').select('*');
  const { data: b2 } = await supabase.from('bank_accounts').select('*').maybeSingle();
  const { data: b3 } = await supabase.from('bank_tally').select('*');

  console.log('bank_account count:', b1?.length || 0);
  console.log('bank_tally rows:', b3);
}

check().catch(console.error);
