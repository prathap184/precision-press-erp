// scripts/inspect_agst_ref_queue.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .in('refId', ['ADV-0001', 'INV-00045', 'INV-00046', 'INV-00047'])
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('Error querying queue:', error);
  } else {
    console.log('--- AGST REF SYNC QUEUE ITEMS ---');
    data.forEach(item => {
      console.log(`\n[${item.status}] ${item.syncType} -> Ref: ${item.refId} (Created: ${item.createdAt})`);
      console.log('Payload billAllocations:', item.payload?.billAllocations);
    });
  }
}

check().catch(console.error);
