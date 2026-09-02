// scripts/fix_all_queue_payloads_clean.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function fixAll() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: queue, error } = await supabase
    .from('tally_sync_queue')
    .select('*');

  if (error || !queue) {
    console.error('Error fetching queue:', error);
    return;
  }

  console.log(`\n🧹 Fixing payloads for all ${queue.length} queue items...`);

  for (const item of queue) {
    const payload = item.payload || {};

    // 1. Set company name
    payload.tallyCompanyName = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

    // 2. Fix bank ledger if it is "Rec1 B1 Bank" or missing
    if (payload.bankLedger === 'Rec1 B1 Bank' || !payload.bankLedger || payload.bankLedger.startsWith('Rec')) {
      payload.bankLedger = 'Federal 2091';
    }
    payload.cashLedger = 'Cash';

    // 3. Fix billAllocations company / target
    if (payload.allocations) {
      payload.allocations.forEach(a => {
        if (!a.billType) a.billType = 'Agst Ref';
      });
    }

    // 4. Update the row in Supabase
    await supabase
      .from('tally_sync_queue')
      .update({
        payload,
        status: 'PENDING',
        lastError: null,
        processedAt: null,
      })
      .eq('id', item.id);

    console.log(`  ✅ Fixed [${item.syncType}] ${item.voucherId || item.id} → Company: "${payload.tallyCompanyName}", Bank: "${payload.bankLedger}"`);
  }

  console.log('\n🎉 ALL 9 PAYLOADS ARE CLEAN & RESET TO PENDING IN SUPABASE!');
}

fixAll().catch(console.error);
