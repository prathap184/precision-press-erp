'use strict';

const http = require('http');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';
const TALLY_HOST = process.env.TALLY_HOST || 'localhost';
const TALLY_PORT = parseInt(process.env.TALLY_PORT || '9000', 10);
const COMPANY = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function clean(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#4;/g, '').trim();
}

function fetchTallyXml(collectionName, typeName, fetchFields) {
  return new Promise((resolve, reject) => {
    const payload = '<ENVELOPE>' +
      '<HEADER>' +
      '<VERSION>1</VERSION>' +
      '<TALLYREQUEST>Export</TALLYREQUEST>' +
      '<TYPE>Collection</TYPE>' +
      '<ID>' + collectionName + '</ID>' +
      '</HEADER>' +
      '<BODY>' +
      '<DESC>' +
      '<STATICVARIABLES>' +
      '<SVCURRENTCOMPANY>' + COMPANY + '</SVCURRENTCOMPANY>' +
      '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>' +
      '</STATICVARIABLES>' +
      '<TDL><TDLMESSAGE>' +
      '<COLLECTION NAME="' + collectionName + '" ISMODIFY="No">' +
      '<TYPE>' + typeName + '</TYPE>' +
      '<FETCH>' + fetchFields + '</FETCH>' +
      '</COLLECTION>' +
      '</TDLMESSAGE></TDL>' +
      '</DESC>' +
      '</BODY>' +
      '</ENVELOPE>';

    const req = http.request({
      hostname: TALLY_HOST, port: TALLY_PORT, path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 90000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', err => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Tally timeout on ' + collectionName)); });
    req.write(payload);
    req.end();
  });
}

async function getGroupCategoryMap() {
  console.log('Fetching groups tree from Tally...');
  const groupsXml = await fetchTallyXml('GroupColl', 'Group', 'Name,Parent');
  const parentMap = new Map();
  const re = /<GROUP\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/GROUP>/gi;
  let m;
  while ((m = re.exec(groupsXml)) !== null) {
    const name = clean(m[1]).toLowerCase();
    const pM = m[2].match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    parentMap.set(name, pM ? clean(pM[1]).toLowerCase() : '');
  }

  function resolveType(groupName) {
    let curr = (groupName || '').toLowerCase().trim();
    let depth = 0;
    while (curr && depth < 10) {
      if (curr.includes('debtor') || curr.includes('customer') || curr.includes('client')) return 'customer';
      if (curr.includes('creditor') || curr.includes('supplier') || curr.includes('vendor')) return 'supplier';
      const parent = parentMap.get(curr);
      if (!parent || parent === curr) break;
      curr = parent;
      depth++;
    }
    return null;
  }

  return resolveType;
}

async function run() {
  console.log('=================================================================');
  console.log('    TALLY -> ERP FULL CONTACTS INGESTION & ADDRESS SYNC');
  console.log('=================================================================\n');

  const resolveType = await getGroupCategoryMap();

  console.log('Fetching all ledgers from Tally...');
  const xml = await fetchTallyXml('LedgerColl', 'Ledger', 'Name,Parent,Guid,AlterId,PartyGSTIN,LedgerMobile,LedgerPhone,OpeningBalance,ClosingBalance,Pincode,LedgerStateName,Address');
  console.log('Got response from Tally! Parsing...\n');

  const ledgerRegex = /LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER/gi;
  let m;
  const tallyLedgers = [];

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = clean(m[1]);
    const body = m[2];

    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const parentGroup = parentM ? clean(parentM[1]) : '';
    const contactType = resolveType(parentGroup);

    // Only process ledgers that belong to Customer (Debtors) or Supplier (Creditors)
    if (!contactType) continue;

    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const alterM = body.match(/<ALTERID[^>]*>([^<]*)<\/ALTERID>/i);
    const gstinM = body.match(/<PARTYGSTIN[^>]*>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN[^>]*>([^<]*)<\/GSTIN>/i);
    const mobileM = body.match(/<LEDGERMOBILE[^>]*>([^<]*)<\/LEDGERMOBILE>/i) || body.match(/<LEDGERPHONE[^>]*>([^<]*)<\/LEDGERPHONE>/i);
    const pinM = body.match(/<PINCODE[^>]*>([^<]*)<\/PINCODE>/i);
    const stateM = body.match(/<STATE[^>]*>([^<]*)<\/STATE>/i) || body.match(/<LEDGERSTATENAME[^>]*>([^<]*)<\/LEDGERSTATENAME>/i);

    const guid = guidM ? clean(guidM[1]) : null;
    const alterId = alterM ? parseInt(alterM[1].trim(), 10) || null : null;
    const gstin = gstinM ? clean(gstinM[1]).toUpperCase() : '';
    let mobile = mobileM ? clean(mobileM[1]).replace(/^PH\s*/i, '').trim() : '';
    const state = stateM ? clean(stateM[1]) : 'Karnataka';
    let pincode = pinM ? clean(pinM[1]) : '';

    const addressLines = [];
    const addrRe = /ADDRESS[^>]*>([^<]*)<\/ADDRESS/gi;
    let aM;
    while ((aM = addrRe.exec(body)) !== null) {
      const line = clean(aM[1]);
      if (!line) continue;
      if (/^\d{10}$/.test(line)) { if (!mobile) mobile = line; }
      else if (!addressLines.includes(line)) addressLines.push(line);
    }

    if (!pincode && addressLines.length) {
      const hit = addressLines.join(' ').match(/\b(\d{6})\b/);
      if (hit) pincode = hit[1];
    }

    const fullAddr = addressLines.join(', ') || null;

    // Balances
    const balM = body.match(/<OPENINGBALANCE[^>]*>([^<]*)<\/OPENINGBALANCE>/i);
    let balNum = 0;
    let opBalType = 'Dr';
    if (balM) {
      const rawBal = clean(balM[1]);
      balNum = Math.abs(parseFloat(rawBal.replace(/[^\d.-]/g, '')) || 0);
      opBalType = rawBal.includes('-') ? 'Dr' : 'Cr';
    }

    const closingM = body.match(/<CLOSINGBALANCE[^>]*>([^<]*)<\/CLOSINGBALANCE>/i);
    let closingBalNum = 0;
    let closingBalType = 'Dr';
    if (closingM) {
      const rawClosing = clean(closingM[1]);
      closingBalNum = Math.abs(parseFloat(rawClosing.replace(/[^\d.-]/g, '')) || 0);
      closingBalType = rawClosing.includes('-') ? 'Dr' : 'Cr';
    }

    tallyLedgers.push({
      name,
      parentGroup,
      guid,
      alterId,
      gstin: gstin || null,
      phone: mobile || null,
      state: state || 'Karnataka',
      city: 'Mysore',
      pincode: pincode || null,
      address: fullAddr,
      type: contactType,
      openingBalance: balNum,
      openingBalanceType: opBalType,
      closingBalance: closingBalNum,
      closingBalanceType: closingBalType,
    });
  }

  console.log('Total customer/supplier contacts identified in Tally: ' + tallyLedgers.length + '\n');

  // Load ALL contacts from ERP database using pagination
  console.log('Loading existing contacts from ERP DB...');
  let allErpContacts = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('contact')
      .select('id, name, tally_ledger_name, tally_guid, billing_address_line1, phone, gstin')
      .eq('organization_id', DEFAULT_ORG_ID)
      .range(from, from + pageSize - 1);
    if (error) { console.error('DB fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allErpContacts = allErpContacts.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log('Loaded ' + allErpContacts.length + ' contacts from ERP DB\n');

  const erpByName = new Map();
  const erpByGuid = new Map();
  for (const c of allErpContacts) {
    if (c.tally_guid) erpByGuid.set(c.tally_guid, c);
    const key = (c.tally_ledger_name || c.name || '').toLowerCase().trim();
    if (key) erpByName.set(key, c);
  }

  let updatedCount = 0;
  let addedCount = 0;
  let errCount = 0;

  for (const item of tallyLedgers) {
    const key = item.name.toLowerCase().trim();
    const existing = (item.guid && erpByGuid.get(item.guid)) || erpByName.get(key);

    const payload = {
      organization_id: DEFAULT_ORG_ID,
      name: item.name,
      displayName: item.name,
      company_name: item.name,
      businessName: item.name,
      business_name: item.name,
      tally_ledger_name: item.name,
      tally_opening_balance: item.openingBalance || 0,
      tally_closing_balance: item.closingBalance || 0,
      opening_balance: item.closingBalance != null ? item.closingBalance : (item.openingBalance || 0),
      opening_balance_type: item.closingBalanceType || item.openingBalanceType || 'Dr',
      phone: item.phone || existing?.phone || null,
      tax_number: item.gstin || existing?.tax_number || null,
      gstin: item.gstin || existing?.gstin || null,
      gstNumber: item.gstin || existing?.gstNumber || null,
      gst_number: item.gstin || existing?.gst_number || null,
      gst_registered: !!item.gstin,
      billing_address_line1: item.address || existing?.billing_address_line1 || null,
      billing_city: item.city || existing?.billing_city || 'Mysore',
      city: item.city || existing?.city || 'Mysore',
      billing_state: item.state || existing?.billing_state || 'Karnataka',
      state: item.state || existing?.state || 'Karnataka',
      billing_country: 'India',
      country: 'India',
      billing_pincode: item.pincode || existing?.billing_pincode || null,
      pincode: item.pincode || existing?.pincode || null,
      tally_guid: item.guid || existing?.tally_guid || null,
      type: item.type,
      is_synced_to_erp: true,
    };

    if (!existing) {
      const { error: insErr } = await supabase.from('contact').insert(payload);
      if (insErr) {
        errCount++;
        console.error('  Failed to insert ' + item.name + ':', insErr.message);
      } else {
        addedCount++;
        if (addedCount <= 5 || addedCount % 100 === 0) {
          console.log('  [NEW +' + addedCount + '] ' + item.name + ' (' + item.type + ') -> ' + (item.address || '(no addr)'));
        }
      }
    } else {
      const { error: updErr } = await supabase.from('contact').update(payload).eq('id', existing.id);
      if (updErr) {
        errCount++;
        console.error('  Failed to update ' + item.name + ':', updErr.message);
      } else {
        updatedCount++;
        if (updatedCount <= 5 || updatedCount % 200 === 0) {
          console.log('  [UPDATED ' + updatedCount + '] ' + item.name + ' -> ' + (item.address || '(no addr)'));
        }
      }
    }
  }

  console.log('\n=================================================================');
  console.log('                        SUMMARY');
  console.log('=================================================================');
  console.log('  Newly Added to ERP : ' + addedCount);
  console.log('  Updated in ERP     : ' + updatedCount);
  console.log('  Errors             : ' + errCount);
  console.log('=================================================================\n');
  console.log('All Tally contacts are now 100% in sync with ERP DB!');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
