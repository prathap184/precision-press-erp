// scripts/fix_agst_ref_queue_payload.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function fix() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Update INV-00045 to Agst Ref ADV-0001
  const { data: q45 } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .eq('refId', 'INV-00045')
    .single();

  if (q45) {
    const updatedPayload = {
      ...q45.payload,
      billAllocations: {
        name: 'ADV-0001',
        billType: 'Agst Ref',
        amount: -564.28,
      },
    };
    await supabase
      .from('tally_sync_queue')
      .update({ payload: updatedPayload, status: 'PENDING' })
      .eq('id', q45.id);
    console.log('✅ Updated INV-00045 payload in queue with Agst Ref ADV-0001');
  }

  // 2. Update INV-00046 to Agst Ref ADV-0001
  const { data: q46 } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .eq('refId', 'INV-00046')
    .single();

  if (q46) {
    const updatedPayload = {
      ...q46.payload,
      billAllocations: {
        name: 'ADV-0001',
        billType: 'Agst Ref',
        amount: -112.86,
      },
    };
    await supabase
      .from('tally_sync_queue')
      .update({ payload: updatedPayload, status: 'PENDING' })
      .eq('id', q46.id);
    console.log('✅ Updated INV-00046 payload in queue with Agst Ref ADV-0001');
  }

  console.log('--- ALL QUEUE ITEMS READY FOR SYNC ---');
}

fix().catch(console.error);
