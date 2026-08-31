// scripts/reset_inflight_to_pending.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function reset() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Leave already synced items alone, reset IN_FLIGHT and FAILED to PENDING
  const { data, error } = await supabase
    .from('tally_sync_queue')
    .update({ status: 'PENDING' })
    .in('status', ['IN_FLIGHT', 'FAILED'])
    .select('id, voucherId, syncType, status');

  if (error) {
    console.error('Error resetting:', error);
  } else {
    console.log(`✅ Successfully reset ${data?.length || 0} items to PENDING:`);
    console.log(data);
  }
}

reset().catch(console.error);
