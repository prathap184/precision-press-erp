// scripts/check_all_queue_items.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function checkAll() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: queue, error } = await supabase
    .from('tally_sync_queue')
    .select('id, status, syncType, voucherId, customerName, amountSnap, createdAt')
    .order('createdAt', { ascending: true });

  console.log('=== ALL ITEMS IN TALLY_SYNC_QUEUE ===');
  console.log(JSON.stringify(queue, null, 2));
}

checkAll().catch(console.error);
