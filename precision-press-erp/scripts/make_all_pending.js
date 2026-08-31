// scripts/make_all_pending.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function makeAllPending() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Update every record in tally_sync_queue to PENDING
  const { data, error } = await supabase
    .from('tally_sync_queue')
    .update({
      status: 'PENDING',
      lastError: null,
      processedAt: null,
    })
    .neq('id', '00000000-0000-0000-0000-000000000000') // matches all rows
    .select('id, voucherId, syncType, status, amountSnap');

  if (error) {
    console.error('Error updating queue:', error);
  } else {
    console.log(`\n🎉 Successfully reset ALL ${data.length} queue items to PENDING:\n`);
    data.forEach((item, idx) => {
      console.log(` ${idx + 1}. [${item.syncType}] ${item.voucherId} | ₹${item.amountSnap} → 🟡 PENDING`);
    });
  }
}

makeAllPending().catch(console.error);
