// scripts/check_all_recent_queue.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching queue:', error);
    return;
  }

  console.log(`--- LATEST 10 ITEMS IN TALLY QUEUE ---`);
  data.forEach((item) => {
    console.log(`[${item.status}] Type: ${item.syncType} | Ref: ${item.refId} | BillType: ${item.payload?.billAllocations?.billType || item.payload?.billAllocations?.[0]?.billType} | Amount: ${item.payload?.totalAmount || item.payload?.grandTotal} | Created: ${item.createdAt}`);
  });
}

check().catch(console.error);
