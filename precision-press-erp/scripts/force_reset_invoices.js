// scripts/force_reset_invoices.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function reset() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .update({ status: 'PENDING', lastError: null })
    .in('voucherId', ['INV-00044', 'INV-00045', 'INV-00046', 'INV-00047'])
    .select('voucherId, status');

  console.log('Reset:', data);
}

reset().catch(console.error);
