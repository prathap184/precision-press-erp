/**
 * Final pass to promote all remaining pending staging rows to live contacts
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncRemaining() {
  console.log('Fetching remaining pending rows from contact_tally...');
  
  // Fetch up to 2,000 pending records
  let allPending = [];
  for (let offset = 0; offset <= 3000; offset += 1000) {
    const { data } = await supabase
      .from('contact_tally')
      .select('*')
      .eq('organization_id', DEFAULT_ORG_ID)
      .eq('import_status', 'pending')
      .range(offset, offset + 999);

    if (data && data.length > 0) {
      allPending = allPending.concat(data);
    } else {
      break;
    }
  }

  console.log(`Found ${allPending.length} remaining pending staging records.`);

  if (allPending.length === 0) {
    console.log('✅ All staging records are already imported!');
    return;
  }

  // Fetch existing live contacts
  let liveContacts = [];
  for (let offset = 0; offset <= 3000; offset += 1000) {
    const { data } = await supabase
      .from('contact')
      .select('id, name, tax_number, tally_guid')
      .eq('organization_id', DEFAULT_ORG_ID)
      .range(offset, offset + 999);
    if (data && data.length > 0) liveContacts = liveContacts.concat(data);
    else break;
  }

  const liveByGuid = new Map();
  const liveByGstin = new Map();
  const liveByName = new Map();

  liveContacts.forEach(c => {
    if (c.tally_guid) liveByGuid.set(c.tally_guid.toLowerCase(), c.id);
    if (c.tax_number) liveByGstin.set(c.tax_number.toUpperCase().trim(), c.id);
    if (c.name) liveByName.set(c.name.toLowerCase().trim(), c.id);
  });

  let created = 0;
  let updated = 0;

  for (const st of allPending) {
    const cleanName = (st.name || '').trim();
    const cleanGstin = (st.tax_number || st.gstin || '').toUpperCase().trim();
    const cleanGuid = (st.tally_guid || '').toLowerCase().trim();

    let matchedId = null;
    if (cleanGuid && liveByGuid.has(cleanGuid)) matchedId = liveByGuid.get(cleanGuid);
    else if (cleanGstin && liveByGstin.has(cleanGstin)) matchedId = liveByGstin.get(cleanGstin);
    else if (cleanName && liveByName.has(cleanName.toLowerCase())) matchedId = liveByName.get(cleanName.toLowerCase());

    const livePayload = {
      organization_id: DEFAULT_ORG_ID,
      name: cleanName,
      type: 'customer',
      tax_number: cleanGstin || null,
      gstin: cleanGstin || null,
      gst_number: cleanGstin || null,
      gst_registered: !!cleanGstin,
      gst_registration_type: cleanGstin ? 'Regular' : 'Unregistered',
      phone: st.phone || null,
      email: st.email || null,
      place_of_supply: st.billing_state || 'Karnataka',
      billing_address_line1: st.billing_address_line1 || null,
      billing_address_line2: st.billing_address_line2 || null,
      billing_city: st.billing_city || 'Mysore',
      billing_state: st.billing_state || 'Karnataka',
      billing_pincode: st.billing_pincode || null,
      billing_country: 'India',
      opening_balance: st.opening_balance || 0,
      opening_balance_type: st.opening_balance_type || 'Dr',
      tally_opening_balance: st.opening_balance || 0,
      tally_ledger_name: cleanName,
      tally_guid: st.tally_guid || null,
      alter_id: st.alter_id || null,
      updated_at: new Date().toISOString()
    };

    let targetId = matchedId;

    if (matchedId) {
      await supabase.from('contact').update(livePayload).eq('id', matchedId);
      updated++;
    } else {
      const { data: newRow } = await supabase.from('contact').insert({
        ...livePayload,
        created_at: new Date().toISOString()
      }).select('id').single();

      if (newRow) {
        targetId = newRow.id;
        created++;
        if (cleanGuid) liveByGuid.set(cleanGuid, targetId);
        if (cleanGstin) liveByGstin.set(cleanGstin, targetId);
        if (cleanName) liveByName.set(cleanName.toLowerCase(), targetId);
      }
    }

    if (targetId) {
      await supabase.from('contact_tally').update({
        import_status: 'imported',
        id: targetId,
        updated_at: new Date().toISOString()
      }).eq('staging_id', st.staging_id);
    }
  }

  console.log(`\n🎉 FINAL PASS FINISHED! Created: ${created}, Updated: ${updated}`);
}

syncRemaining().catch(console.error);
