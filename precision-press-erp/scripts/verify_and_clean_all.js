// scripts/verify_and_clean_all.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function clean() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: queue, error } = await supabase.from('tally_sync_queue').select('*');

  if (error || !queue) {
    console.error('Error:', error);
    return;
  }

  for (const item of queue) {
    const payload = item.payload || {};
    payload.tallyCompanyName = 'Hindustan Enterprises 25-26';
    if (!payload.bankLedger || payload.bankLedger.startsWith('Rec')) {
      payload.bankLedger = 'Federal 2091';
    }
    payload.cashLedger = 'Cash';

    await supabase
      .from('tally_sync_queue')
      .update({
        payload,
        status: 'PENDING',
        lastError: null,
      })
      .eq('id', item.id);
  }

  console.log('✅ All 9 items cleaned and set to PENDING!');
}

clean().catch(console.error);
