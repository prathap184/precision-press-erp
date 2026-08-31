// scripts/reset_invoices_to_pending.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function reset() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .update({ status: 'PENDING', lastError: null })
    .in('status', ['FAILED', 'IN_FLIGHT'])
    .select('id, voucherId, syncType');

  console.log('Reset items:', data);
}

reset().catch(console.error);
