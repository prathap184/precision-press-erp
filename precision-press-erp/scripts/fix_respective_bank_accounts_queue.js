// scripts/fix_respective_bank_accounts_queue.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function fixRespectiveBanks() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: queue } = await supabase.from('tally_sync_queue').select('*');

  for (const item of queue || []) {
    const payload = item.payload || {};
    payload.tallyCompanyName = 'Hindustan Enterprises 25-26';

    if (item.voucherId === 'REC-00036') {
      payload.bankLedger = 'Cash B2';
      payload.cashLedger = 'Cash B2';
      payload.paymentMode = 'CASH';
      payload.voucherType = 'Rec10 B8 Cash';
    } else if (item.voucherId === 'ADV-98A2F7') {
      payload.bankLedger = 'Cash';
      payload.cashLedger = 'Cash';
      payload.paymentMode = 'CASH';
      payload.voucherType = 'Rec10 B8 Cash';
    } else if (item.voucherId === 'ADV-0001' || item.voucherId === 'ADV-0002') {
      payload.bankLedger = 'Federal 2091';
      payload.paymentMode = 'BANK';
      payload.voucherType = 'Rec1 B1 Bank';
    }

    await supabase
      .from('tally_sync_queue')
      .update({
        payload,
        status: 'PENDING',
        lastError: null,
      })
      .eq('id', item.id);

    console.log(`Updated [${item.syncType}] ${item.voucherId} → Ledger: "${payload.bankLedger || payload.cashLedger}", Type: "${payload.voucherType || ''}"`);
  }

  console.log('\n✅ Successfully mapped each receipt to its exact respective cash/bank drawer!');
}

fixRespectiveBanks().catch(console.error);
