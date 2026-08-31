// scripts/check_tally_queue.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.log('No Supabase credentials in .env.local');
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('tally_sync_queue')
    .select('id, syncType, voucherType, refId, status, customerName, createdAt')
    .order('createdAt', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error querying tally_sync_queue:', error);
  } else {
    console.log('--- LATEST TALLY SYNC QUEUE ITEMS ---');
    console.log(data);
  }
}

check().catch(console.error);
