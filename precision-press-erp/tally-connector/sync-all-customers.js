/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║        PRECISION PRESS ERP — FAST TALLY CUSTOMER INGESTION ENGINE           ║
 * ║        Stages 1,256 Customers ➔ contact_tally ➔ Live contact table          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const rootEnvPath = path.resolve(__dirname, '../.env.local');
require('dotenv').config({ path: rootEnvPath });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');

const CUSTOMER_GROUPS = [
  'debtor',
  'sundry debtor',
  'customer',
  'client',
  'bo debtor',
  'so debtor',
  'uv debtor',
  'psd debtor'
];

function isCustomerGroup(group) {
  if (!group) return false;
  const lower = group.toLowerCase();
  if (lower.includes('creditor') || lower.includes('supplier')) return false;
  return CUSTOMER_GROUPS.some(k => lower.includes(k));
}

function clean(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#4;/g, '').trim();
}

function parseCustomers() {
  console.log('📂 Reading listofledgers.xml...');
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  const customers = [];
  let m;

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const rawName = m[1];
    const name = clean(rawName);
    const body = m[2];

    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? clean(parentM[1]) : '';
    if (!isCustomerGroup(parentGroup)) continue;

    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const gstinM = body.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN>([^<]*)<\/GSTIN>/i);
    const mobileM = body.match(/<LEDGERMOBILE>([^<]*)<\/LEDGERMOBILE>/i);
    const emailM = body.match(/<EMAIL>([^<]*)<\/EMAIL>/i);
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const stateM = body.match(/<STATE>([^<]*)<\/STATE>/i) || body.match(/<OLDLEDSTATENAME>([^<]*)<\/OLDLEDSTATENAME>/i);
    const pinM = body.match(/<PINCODE>([^<]*)<\/PINCODE>/i);

    const guid = guidM ? clean(guidM[1]) : null;
    const alterId = alterM ? parseInt(alterM[1].trim(), 10) || null : null;
    const gstin = gstinM ? clean(gstinM[1]).toUpperCase() : '';
    let mobile = mobileM ? clean(mobileM[1]).replace(/^PH\s*/i, '').trim() : '';
    const email = emailM ? clean(emailM[1]) : '';
    const state = stateM ? clean(stateM[1]) : 'Karnataka';
    const pincode = pinM ? clean(pinM[1]) : '';

    const addressLines = [];
    const addrRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
    let aM;
    while ((aM = addrRegex.exec(body)) !== null) {
      const line = clean(aM[1]);
      if (line) {
        if (!mobile && /^\d{10}$/.test(line)) mobile = line;
        else addressLines.push(line);
      }
    }

    let balNum = 0;
    let balType = 'Dr';
    if (balM) {
      const raw = clean(balM[1]);
      const cleanNum = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
      balNum = Math.abs(cleanNum);
      balType = raw.startsWith('-') || cleanNum > 0 ? 'Dr' : 'Cr';
    }

    customers.push({
      organization_id: DEFAULT_ORG_ID,
      name,
      tally_ledger_name: name,
      tally_ledger_group: parentGroup,
      tally_guid: guid,
      alter_id: alterId,
      tax_number: gstin || null,
      gstin: gstin || null,
      gst_number: gstin || null,
      gst_registered: !!gstin,
      gst_registration_type: gstin ? 'Regular' : 'Unregistered',
      phone: mobile || null,
      email: email || null,
      city: addressLines[addressLines.length - 1] || 'Mysore',
      state: state,
      country: 'India',
      pincode: pincode || null,
      billing_address_line1: addressLines[0] || null,
      billing_address_line2: addressLines.slice(1).join(', ') || null,
      billing_city: 'Mysore',
      billing_state: state,
      billing_pincode: pincode || null,
      billing_country: 'India',
      opening_balance: balNum,
      opening_balance_type: balType,
      type: 'customer',
      import_status: 'pending'
    });
  }

  return customers;
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('   🚀 STEP 1: PARSING & STAGING ALL 1,256 CUSTOMERS');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  const customers = parseCustomers();
  console.log(`✅ Extracted ${customers.length} Customers.`);

  // 1. Fetch existing tally_guids in contact_tally to avoid duplicate staging rows
  const { data: existingStaging } = await supabase
    .from('contact_tally')
    .select('staging_id, name, tally_guid, tax_number')
    .eq('organization_id', DEFAULT_ORG_ID);

  const existingGuidMap = new Map();
  const existingNameMap = new Map();
  (existingStaging || []).forEach(r => {
    if (r.tally_guid) existingGuidMap.set(r.tally_guid.toLowerCase(), r.staging_id);
    if (r.name) existingNameMap.set(r.name.toLowerCase().trim(), r.staging_id);
  });

  console.log(`Found ${existingStaging?.length || 0} existing rows in staging.`);

  const toInsert = [];
  const toUpdate = [];

  customers.forEach(c => {
    const guidKey = c.tally_guid ? c.tally_guid.toLowerCase() : null;
    const nameKey = c.name.toLowerCase().trim();

    if (guidKey && existingGuidMap.has(guidKey)) {
      toUpdate.push({ staging_id: existingGuidMap.get(guidKey), ...c });
    } else if (existingNameMap.has(nameKey)) {
      toUpdate.push({ staging_id: existingNameMap.get(nameKey), ...c });
    } else {
      toInsert.push(c);
    }
  });

  console.log(`To Insert into Staging: ${toInsert.length}, To Update: ${toUpdate.length}`);

  // Batch insert new staging
  const batchSize = 100;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const chunk = toInsert.slice(i, i + batchSize);
    const { error } = await supabase.from('contact_tally').insert(chunk);
    if (error) console.error(`Staging insert error (${i}):`, error.message);
    else process.stdout.write(`   ✓ Inserted ${Math.min(i + batchSize, toInsert.length)}/${toInsert.length} staging rows...\r`);
  }

  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('   🚀 STEP 2: SYNCING VERIFIED CUSTOMERS INTO LIVE CONTACT TABLE');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  // Fetch all pending staging rows
  const { data: pendingRows } = await supabase
    .from('contact_tally')
    .select('*')
    .eq('organization_id', DEFAULT_ORG_ID)
    .eq('import_status', 'pending');

  console.log(`Found ${pendingRows?.length || 0} pending customer staging rows to sync.`);

  // Fetch existing live contacts for matching
  const { data: liveContacts } = await supabase
    .from('contact')
    .select('id, name, tax_number, tally_guid')
    .eq('organization_id', DEFAULT_ORG_ID);

  const liveByGuid = new Map();
  const liveByGstin = new Map();
  const liveByName = new Map();

  (liveContacts || []).forEach(c => {
    if (c.tally_guid) liveByGuid.set(c.tally_guid.toLowerCase(), c.id);
    if (c.tax_number) liveByGstin.set(c.tax_number.toUpperCase().trim(), c.id);
    if (c.name) liveByName.set(c.name.toLowerCase().trim(), c.id);
  });

  let createdLive = 0;
  let updatedLive = 0;

  for (const st of (pendingRows || [])) {
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
      updatedLive++;
    } else {
      const { data: newRow } = await supabase.from('contact').insert({
        ...livePayload,
        created_at: new Date().toISOString()
      }).select('id').single();

      if (newRow) {
        targetId = newRow.id;
        createdLive++;
        if (cleanGuid) liveByGuid.set(cleanGuid, targetId);
        if (cleanGstin) liveByGstin.set(cleanGstin, targetId);
        if (cleanName) liveByName.set(cleanName.toLowerCase(), targetId);
      }
    }

    // Mark staging as imported
    if (targetId) {
      await supabase.from('contact_tally').update({
        import_status: 'imported',
        id: targetId,
        updated_at: new Date().toISOString()
      }).eq('staging_id', st.staging_id);
    }
  }

  console.log(`\n🎉 CUSTOMER MASTER SYNC COMPLETED SUCCESSFULLY!`);
  console.log(`   ✨ New Live Customers Created:  ${createdLive}`);
  console.log(`   🔄 Existing Customers Updated: ${updatedLive}`);
  console.log(`   📊 Total Verified Customers:   ${createdLive + updatedLive}\n`);
}

run().catch(console.error);
