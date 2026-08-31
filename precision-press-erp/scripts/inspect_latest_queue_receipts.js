// scripts/inspect_latest_queue_receipts.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function inspect() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .eq('syncType', 'RECEIPT_VOUCHER')
    .order('createdAt', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching queue:', error);
    return;
  }

  console.log(`--- FOUND ${data.length} RECENT RECEIPT VOUCHERS IN TALLY QUEUE ---`);
  data.forEach((item, index) => {
    console.log(`\n================== RECEIPT #${index + 1}: ${item.refId} ==================`);
    console.log(`Queue ID: ${item.id}`);
    console.log(`Status: ${item.status}`);
    console.log(`Customer: ${item.customerName}`);
    console.log(`Created At: ${item.createdAt}`);
    console.log('Payload JSON:');
    console.log(JSON.stringify(item.payload, null, 2));
  });
}

inspect().catch(console.error);
