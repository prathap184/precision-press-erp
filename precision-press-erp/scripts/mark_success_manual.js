// scripts/mark_success_manual.js
// Marks tally_sync_queue items that succeeded in Tally but had socket hang up
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function markSuccess() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Mark the specific known-success item
  const targetId = 'TSYNC-R-1787726900000-ADV';

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .update({
      status: 'SUCCESS',
      processedAt: new Date().toISOString(),
      lastError: null,
    })
    .eq('id', targetId)
    .select();

  if (error) {
    console.error('Error marking success:', error);
  } else {
    console.log(`✅ Marked ${targetId} as SUCCESS!`, data);
  }

  // Show current queue status
  const { data: queue } = await supabase
    .from('tally_sync_queue')
    .select('id, status, syncType, voucherId, customerName, amountSnap')
    .order('createdAt', { ascending: true });

  console.log('\n=== CURRENT QUEUE STATUS ===');
  (queue || []).forEach(item => {
    const icon = item.status === 'SUCCESS' ? '✅' : item.status === 'FAILED' ? '❌' : '🟡';
    console.log(`${icon} ${item.id} | ${item.status} | ${item.syncType} | ${item.voucherId} | ₹${item.amountSnap}`);
  });
}

markSuccess().catch(console.error);
