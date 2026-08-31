// scripts/reset_pending_queue.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function reset() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .update({ status: 'PENDING', lastError: null })
    .in('status', ['FAILED', 'PENDING']);

  if (error) {
    console.error('Reset error:', error);
  } else {
    console.log('✅ Successfully reset queue items to PENDING for re-sync!');
  }
}

reset().catch(console.error);
