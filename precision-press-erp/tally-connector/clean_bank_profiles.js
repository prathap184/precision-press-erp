const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function cleanBankProfiles() {
  const { data: cashGl } = await supabase.from('chart_account').select('id, tally_guid').eq('code', '1000').single();
  const { data: fedGl } = await supabase.from('chart_account').select('id, tally_guid').eq('code', '1100').single();
  const { data: b2Gl } = await supabase.from('chart_account').select('id, tally_guid').eq('code', '1010').single();

  // 1. Deactivate / remove old sample accounts
  await supabase
    .from('bank_account')
    .update({ is_active: false })
    .in('account_name', ['Business Checking', 'Business Savings', 'Business Credit Card', 'Cash Drawer']);

  // 2. Upsert the 3 official operational accounts
  const officialProfiles = [
    {
      account_name: 'Federal Bank',
      bank_name: 'Federal Bank',
      account_number: '****2091',
      account_type: 'checking',
      currency_code: 'INR',
      chart_account_id: fedGl.id,
      balance: 915.00,
      tally_ledger_name: 'Federal 2091',
      tally_guid: fedGl.tally_guid,
      ifsc_code: 'FDRL0001234',
      branch_name: 'Mysore Main Branch',
      is_active: true
    },
    {
      account_name: 'Main Cash Drawer',
      bank_name: 'Cash in Hand',
      account_number: 'MAIN-CASH',
      account_type: 'cash',
      currency_code: 'INR',
      chart_account_id: cashGl.id,
      balance: 3173956.41,
      tally_ledger_name: 'Cash',
      tally_guid: cashGl.tally_guid,
      ifsc_code: null,
      branch_name: 'Head Office Cash Counter',
      is_active: true
    },
    {
      account_name: 'Cash B2 Drawer',
      bank_name: 'Cash in Hand (B2)',
      account_number: 'BRANCH-B2',
      account_type: 'cash',
      currency_code: 'INR',
      chart_account_id: b2Gl.id,
      balance: 74042.00,
      tally_ledger_name: 'Cash B2',
      tally_guid: b2Gl.tally_guid,
      ifsc_code: null,
      branch_name: 'Branch 2 Cash Counter',
      is_active: true
    }
  ];

  for (const p of officialProfiles) {
    const { data: existing } = await supabase.from('bank_account').select('id').eq('tally_ledger_name', p.tally_ledger_name).maybeSingle();
    if (existing) {
      await supabase.from('bank_account').update(p).eq('id', existing.id);
    } else {
      await supabase.from('bank_account').insert({ ...p, organization_id: '00000000-0000-0000-0000-000000000002' });
    }
  }

  console.log('✅ Cleaned and synchronized operational bank accounts!');
}

cleanBankProfiles();
