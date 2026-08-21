/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║        PRECISION PRESS ERP — TALLY CUSTOMERS SYNC MODULE                    ║
 * ║        File: tally-connector/sync-customers.js                              ║
 * ║        Purpose: Reads Customer Ledgers ➔ Stages in contact_tally           ║
 * ║                 ➔ Upserts into live contact table (Zero Duplicates)         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables (check root .env.local, local .env, etc.)
const rootEnvPath = path.resolve(__dirname, '../.env.local');
const localEnvPath = path.resolve(__dirname, '.env');

if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
} else if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath });
} else {
  require('dotenv').config();
}

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000002';

if (!SUPABASE_KEY) {
  console.error('❌ Error: Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Default XML export directories to check
const XML_SEARCH_PATHS = [
  path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml'),
  path.resolve(__dirname, '../tally_sync/all ledgers/Master.xml'),
  path.resolve(__dirname, 'listofledgers.xml'),
  path.resolve(__dirname, 'Master.xml'),
];

// Customer Group keywords (Debtors & Sub-divisions)
const CUSTOMER_GROUP_KEYWORDS = [
  'debtor',
  'sundry debtor',
  'customer',
  'client',
  'bo debtor',
  'so debtor',
  'uv debtor',
  'psd debtor'
];

/**
 * Checks if a ledger parent group is a customer/debtor group
 */
function isCustomerGroup(parentGroup) {
  if (!parentGroup) return false;
  const lower = parentGroup.toLowerCase();
  // Exclude creditors / suppliers
  if (lower.includes('creditor') || lower.includes('supplier')) return false;
  return CUSTOMER_GROUP_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Clean & unescape XML strings
 */
function cleanXmlString(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .trim();
}

/**
 * Parse XML and extract structured customer ledger records
 */
function parseCustomerLedgersFromXml(xmlContent) {
  console.log('🔍 Scanning XML for customer ledger blocks...');
  const customers = [];

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let match;

  while ((match = ledgerRegex.exec(xmlContent)) !== null) {
    const rawName = match[1];
    const name = cleanXmlString(rawName);
    const body = match[2];

    // 1. Group / Parent
    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? cleanXmlString(parentM[1]) : '';

    if (!isCustomerGroup(parentGroup)) {
      continue; // Skip non-customer ledgers (suppliers, banks, expenses)
    }

    // 2. GUID & AlterID
    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const guid = guidM ? cleanXmlString(guidM[1]) : null;
    const alterId = alterM ? parseInt(alterM[1].trim(), 10) || null : null;

    // 3. User & Audit
    const createdByM = body.match(/<CREATEDBY>([^<]*)<\/CREATEDBY>/i) || body.match(/<ENTEREDBY>([^<]*)<\/ENTEREDBY>/i);
    const alteredOnM = body.match(/<ALTEREDON>([^<]*)<\/ALTEREDON>/i);
    const isDeletedM = body.match(/<ISDELETED>([^<]*)<\/ISDELETED>/i);
    const createdBy = createdByM ? cleanXmlString(createdByM[1]) : null;
    const alteredOn = alteredOnM ? cleanXmlString(alteredOnM[1]) : null;
    const isDeleted = isDeletedM && isDeletedM[1].trim().toLowerCase() === 'yes';

    // 4. GSTIN & Tax Details
    const gstinM = body.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN>([^<]*)<\/GSTIN>/i);
    const gstRegTypeM = body.match(/<GSTREGISTRATIONTYPE>([^<]*)<\/GSTREGISTRATIONTYPE>/i);
    const posM = body.match(/<PLACEOFSUPPLY>([^<]*)<\/PLACEOFSUPPLY>/i);
    const isSezM = body.match(/<ISSEZPARTY>([^<]*)<\/ISSEZPARTY>/i);
    const isTransporterM = body.match(/<ISTRANSPORTER>([^<]*)<\/ISTRANSPORTER>/i);

    const gstin = gstinM ? cleanXmlString(gstinM[1]).toUpperCase() : '';
    const gstRegistrationType = gstRegTypeM ? cleanXmlString(gstRegTypeM[1]) : (gstin ? 'Regular' : 'Unregistered');
    const placeOfSupply = posM ? cleanXmlString(posM[1]) : '';
    const isSez = isSezM ? isSezM[1].trim().toLowerCase() === 'yes' : false;
    const isTransporter = isTransporterM ? isTransporterM[1].trim().toLowerCase() === 'yes' : false;

    // 5. Contact & Phone
    const mobileM = body.match(/<LEDGERMOBILE>([^<]*)<\/LEDGERMOBILE>/i);
    const emailM = body.match(/<EMAIL>([^<]*)<\/EMAIL>/i);
    let mobile = mobileM ? cleanXmlString(mobileM[1]) : '';
    let email = emailM ? cleanXmlString(emailM[1]) : '';

    if (mobile) {
      mobile = mobile.replace(/^PH\s*/i, '').trim();
    }

    // 6. Address Lines
    const addressLines = [];
    const addressBlockRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
    let addrMatch;
    while ((addrMatch = addressBlockRegex.exec(body)) !== null) {
      const line = cleanXmlString(addrMatch[1]);
      if (line) {
        if (!mobile && /^\d{10}$/.test(line)) {
          mobile = line;
        } else {
          addressLines.push(line);
        }
      }
    }

    const stateM = body.match(/<STATE>([^<]*)<\/STATE>/i) || body.match(/<OLDLEDSTATENAME>([^<]*)<\/OLDLEDSTATENAME>/i);
    const pinM = body.match(/<PINCODE>([^<]*)<\/PINCODE>/i) || body.match(/<OLDPINCODE>([^<]*)<\/OLDPINCODE>/i);
    const countryM = body.match(/<COUNTRY>([^<]*)<\/COUNTRY>/i) || body.match(/<COUNTRYOFRESIDENCE>([^<]*)<\/COUNTRYOFRESIDENCE>/i);
    const cityM = body.match(/<BILLTOPLACE>([^<]*)<\/BILLTOPLACE>/i);

    const state = stateM ? cleanXmlString(stateM[1]) : 'Karnataka';
    const pincode = pinM ? cleanXmlString(pinM[1]) : '';
    const country = countryM ? cleanXmlString(countryM[1]) : 'India';
    const city = cityM ? cleanXmlString(cityM[1]) : (addressLines.length > 2 ? addressLines[addressLines.length - 1] : 'Mysore');

    const line1 = addressLines[0] || '';
    const line2 = addressLines.slice(1).join(', ');

    // 7. Balances & Credit Terms
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const creditDaysM = body.match(/<BILLCREDITPERIOD>([^<]*)<\/BILLCREDITPERIOD>/i);
    const creditLimitM = body.match(/<CREDITLIMIT>([^<]*)<\/CREDITLIMIT>/i);

    let rawBal = balM ? cleanXmlString(balM[1]) : '0';
    let balanceNum = 0;
    let balanceType = 'Dr';

    if (rawBal) {
      const isNegative = rawBal.startsWith('-');
      const cleanNum = parseFloat(rawBal.replace(/[^\d.-]/g, '')) || 0;
      balanceNum = Math.abs(cleanNum);
      balanceType = isNegative || cleanNum > 0 ? 'Dr' : 'Cr';
    }

    let paymentTermsDays = 30;
    if (creditDaysM) {
      const parsedDays = parseInt(creditDaysM[1].replace(/[^\d]/g, ''), 10);
      if (!isNaN(parsedDays) && parsedDays > 0) paymentTermsDays = parsedDays;
    }

    const creditLimit = creditLimitM ? parseFloat(creditLimitM[1].replace(/[^\d.-]/g, '')) || 0 : 0;

    // 8. MSME Registration
    const msmeM = body.match(/<MSMEREGISTRATIONDETAILS>([^<]*)<\/MSMEREGISTRATIONDETAILS>/i);
    const msmeRegNumber = msmeM ? cleanXmlString(msmeM[1]) : null;

    customers.push({
      name,
      tally_ledger_name: name,
      tally_ledger_group: parentGroup,
      tally_guid: guid,
      alter_id: alterId,
      tally_created_by: createdBy,
      tally_altered_on: alteredOn,
      is_deleted: isDeleted,
      tax_number: gstin || null,
      gstin: gstin || null,
      gst_registration_type: gstRegistrationType,
      place_of_supply: placeOfSupply || state,
      is_sez: isSez,
      is_transporter: isTransporter,
      phone: mobile || null,
      email: email || null,
      addresses: {
        billing: {
          line1,
          line2,
          city,
          state,
          postalCode: pincode,
          country
        },
        shipping: {
          line1,
          line2,
          city,
          state,
          postalCode: pincode,
          country
        }
      },
      billing_address_line1: line1,
      billing_address_line2: line2,
      billing_city: city,
      billing_state: state,
      billing_pincode: pincode,
      billing_country: country,
      opening_balance: balanceNum,
      opening_balance_type: balanceType,
      tally_opening_balance: balanceNum,
      payment_terms_days: paymentTermsDays,
      credit_limit: creditLimit,
      msme_reg_number: msmeRegNumber
    });
  }

  return customers;
}

/**
 * Step 1: Ingest parsed customers into contact_tally (Staging Table)
 */
async function stageCustomers(customers, organizationId) {
  console.log(`\n📦 STEP 1: Ingesting ${customers.length} customers into 'contact_tally' staging table...`);
  
  const batchSize = 100;
  let stagedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < customers.length; i += batchSize) {
    const chunk = customers.slice(i, i + batchSize);
    
    const rows = chunk.map(c => ({
      organization_id: organizationId,
      name: c.name,
      tally_ledger_name: c.tally_ledger_name,
      tally_ledger_group: c.tally_ledger_group,
      tally_guid: c.tally_guid,
      alter_id: c.alter_id,
      tally_created_by: c.tally_created_by,
      tally_altered_on: c.tally_altered_on,
      tax_number: c.tax_number,
      gstin: c.gstin,
      gst_registration_type: c.gst_registration_type,
      place_of_supply: c.place_of_supply,
      is_sez: c.is_sez,
      is_transporter: c.is_transporter,
      phone: c.phone,
      email: c.email,
      addresses: c.addresses,
      billing_address_line1: c.billing_address_line1,
      billing_address_line2: c.billing_address_line2,
      billing_city: c.billing_city,
      billing_state: c.billing_state,
      billing_pincode: c.billing_pincode,
      billing_country: c.billing_country,
      opening_balance: c.opening_balance,
      opening_balance_type: c.opening_balance_type,
      tally_opening_balance: c.tally_opening_balance,
      payment_terms_days: c.payment_terms_days,
      credit_limit: c.credit_limit,
      msme_reg_number: c.msme_reg_number,
      type: 'customer',
      import_status: 'pending'
    }));

    const { data, error } = await supabase
      .from('contact_tally')
      .upsert(rows, { onConflict: 'tally_guid,organization_id', ignoreDuplicates: false });

    if (error) {
      // Fallback one-by-one
      for (const row of rows) {
        const singleRes = await supabase.from('contact_tally').insert(row);
        if (singleRes.error) {
          errorCount++;
        } else {
          stagedCount++;
        }
      }
    } else {
      stagedCount += chunk.length;
      process.stdout.write(`   ✓ Staged ${stagedCount}/${customers.length} records...\r`);
    }
  }

  console.log(`\n✅ Staging complete! Total staged: ${stagedCount}, Errors: ${errorCount}`);
  return { stagedCount, errorCount };
}

/**
 * Step 2: Push/Sync verified staging records to live 'contact' table
 */
async function syncToLiveContacts(organizationId) {
  console.log(`\n🚀 STEP 2: Syncing verified customers to live 'contact' table (Zero Duplicates on GUID/GST/Name)...`);

  const { data: pendingRows, error: fetchErr } = await supabase
    .from('contact_tally')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('import_status', 'pending');

  if (fetchErr) {
    console.error('❌ Failed to fetch pending staging records:', fetchErr.message);
    return;
  }

  if (!pendingRows || pendingRows.length === 0) {
    console.log('ℹ️ No pending customer records to sync in contact_tally.');
    return;
  }

  console.log(`Found ${pendingRows.length} pending customer records to sync.`);

  // Fetch existing contacts to match and avoid duplicates
  const { data: existingContacts } = await supabase
    .from('contact')
    .select('id, name, tax_number, tally_guid')
    .eq('organization_id', organizationId);

  const existingByGuid = new Map();
  const existingByGstin = new Map();
  const existingByName = new Map();

  (existingContacts || []).forEach(ec => {
    if (ec.tally_guid) existingByGuid.set(ec.tally_guid.toLowerCase(), ec.id);
    if (ec.tax_number) existingByGstin.set(ec.tax_number.toUpperCase().trim(), ec.id);
    if (ec.name) existingByName.set(ec.name.toLowerCase().trim(), ec.id);
  });

  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  for (const staging of pendingRows) {
    const cleanName = (staging.name || '').trim();
    const cleanGstin = (staging.tax_number || staging.gstin || '').toUpperCase().trim();
    const cleanGuid = (staging.tally_guid || '').toLowerCase().trim();

    let matchedId = null;
    if (cleanGuid && existingByGuid.has(cleanGuid)) {
      matchedId = existingByGuid.get(cleanGuid);
    } else if (cleanGstin && existingByGstin.has(cleanGstin)) {
      matchedId = existingByGstin.get(cleanGstin);
    } else if (cleanName && existingByName.has(cleanName.toLowerCase())) {
      matchedId = existingByName.get(cleanName.toLowerCase());
    }

    const contactPayload = {
      organization_id: organizationId,
      name: cleanName,
      type: 'customer',
      tax_number: cleanGstin || null,
      gstin: cleanGstin || null,
      gst_number: cleanGstin || null,
      gst_registration_type: staging.gst_registration_type || 'Regular',
      place_of_supply: staging.place_of_supply || 'Karnataka',
      phone: staging.phone || null,
      email: staging.email || null,
      addresses: staging.addresses || null,
      billing_address_line1: staging.billing_address_line1 || null,
      billing_address_line2: staging.billing_address_line2 || null,
      billing_city: staging.billing_city || 'Mysore',
      billing_state: staging.billing_state || 'Karnataka',
      billing_pincode: staging.billing_pincode || null,
      billing_country: staging.billing_country || 'India',
      opening_balance: staging.opening_balance || 0,
      opening_balance_type: staging.opening_balance_type || 'Dr',
      tally_opening_balance: staging.tally_opening_balance || 0,
      payment_terms_days: staging.payment_terms_days || 30,
      credit_limit: staging.credit_limit || 0,
      tally_ledger_name: staging.tally_ledger_name || cleanName,
      tally_guid: staging.tally_guid || null,
      alter_id: staging.alter_id || null,
      is_transporter: staging.is_transporter || false,
      msme_reg_number: staging.msme_reg_number || null,
      updated_at: new Date().toISOString()
    };

    let targetContactId = matchedId;

    if (matchedId) {
      const { error: updErr } = await supabase
        .from('contact')
        .update(contactPayload)
        .eq('id', matchedId);

      if (updErr) {
        failedCount++;
        continue;
      }
      updatedCount++;
    } else {
      const { data: newContact, error: insErr } = await supabase
        .from('contact')
        .insert({ ...contactPayload, created_at: new Date().toISOString() })
        .select('id')
        .single();

      if (insErr) {
        failedCount++;
        continue;
      }
      targetContactId = newContact.id;
      createdCount++;

      if (cleanGuid) existingByGuid.set(cleanGuid, targetContactId);
      if (cleanGstin) existingByGstin.set(cleanGstin, targetContactId);
      if (cleanName) existingByName.set(cleanName.toLowerCase(), targetContactId);
    }

    // Mark staging as imported
    await supabase
      .from('contact_tally')
      .update({
        import_status: 'imported',
        imported_contact_id: targetContactId,
        updated_at: new Date().toISOString()
      })
      .eq('staging_id', staging.staging_id);
  }

  console.log(`\n🎉 SYNC TO LIVE CONTACTS FINISHED!`);
  console.log(`   ✨ New Contacts Created:   ${createdCount}`);
  console.log(`   🔄 Existing Contacts Updated: ${updatedCount}`);
  console.log(`   ❌ Failed:                   ${failedCount}`);
}

/**
 * Main Runner
 */
async function runCustomerSync(customFilePath = null) {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('   🚀 PRECISION PRESS ERP — TALLY CUSTOMER SYNC ENGINE');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  let xmlPath = customFilePath;
  if (!xmlPath || !fs.existsSync(xmlPath)) {
    xmlPath = XML_SEARCH_PATHS.find(p => fs.existsSync(p));
  }

  if (!xmlPath) {
    console.error('❌ Could not locate listofledgers.xml or Master.xml in standard directories.');
    console.error('   Usage: node sync-customers.js "path/to/listofledgers.xml"');
    process.exit(1);
  }

  console.log(`📂 Found Tally Export File: ${xmlPath}`);
  const rawXml = fs.readFileSync(xmlPath, 'utf8');

  const customers = parseCustomerLedgersFromXml(rawXml);
  console.log(`📊 Successfully parsed ${customers.length} Customers across all division groups.`);

  // Step 1: Stage to contact_tally
  await stageCustomers(customers, DEFAULT_ORG_ID);

  // Step 2: Push to live contact table
  await syncToLiveContacts(DEFAULT_ORG_ID);

  console.log('\n🏁 Customer sync completed successfully!\n');
}

if (require.main === module) {
  const targetFile = process.argv[2] || null;
  runCustomerSync(targetFile).catch(err => {
    console.error('Fatal error during customer sync:', err);
    process.exit(1);
  });
}

module.exports = {
  parseCustomerLedgersFromXml,
  stageCustomers,
  syncToLiveContacts,
  runCustomerSync
};
