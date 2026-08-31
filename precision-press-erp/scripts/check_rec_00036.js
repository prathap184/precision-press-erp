// scripts/check_rec_00036.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('=== SEARCHING FOR REC-00036 IN DATABASE & TALLY QUEUE ===\n');

  // 1. Check tally_sync_queue
  const { data: queueItems } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .or(`refId.eq.REC-00036,voucherId.eq.REC-00036`);

  console.log('1. Tally Sync Queue:');
  if (queueItems && queueItems.length > 0) {
    queueItems.forEach(q => {
      console.log(`- ID: ${q.id} | Status: ${q.status} | Type: ${q.syncType} | Customer: ${q.customerName}`);
      console.log('  Payload:', JSON.stringify(q.payload, null, 2));
    });
  } else {
    console.log('  Not found by refId REC-00036 directly, checking like query...');
    const { data: likeQueue } = await supabase
      .from('tally_sync_queue')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(5);
    console.log('  Latest 5 queue items:', likeQueue?.map(x => `${x.refId} (${x.syncType})`));
  }

  // 2. Check payments table
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .or(`payment_number.eq.REC-00036,reference.eq.REC-00036,id.eq.REC-00036`);
  console.log('\n2. Payments Table:');
  console.log(payments);

  // 3. Check customer credits
  const { data: credits } = await supabase
    .from('customer_credits')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n3. Latest Customer Credits:');
  console.log(credits);
}

check().catch(console.error);
