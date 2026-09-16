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

function fetchLedgersFromTally() {
  return new Promise((resolve, reject) => {
    const payload = '<ENVELOPE>' +
      '<HEADER>' +
      '<VERSION>1</VERSION>' +
      '<TALLYREQUEST>Export</TALLYREQUEST>' +
      '<TYPE>Collection</TYPE>' +
      '<ID>LedgerCollection</ID>' +
      '</HEADER>' +
      '<BODY>' +
      '<DESC>' +
      '<STATICVARIABLES>' +
      '<SVCURRENTCOMPANY>' + COMPANY + '</SVCURRENTCOMPANY>' +
      '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>' +
      '</STATICVARIABLES>' +
      '<TDL><TDLMESSAGE>' +
      '<COLLECTION NAME="LedgerCollection" ISMODIFY="No">' +
      '<TYPE>Ledger</TYPE>' +
      '<FETCH>Name,Parent,Guid,AlterId,PartyGSTIN,LedgerMobile,LedgerPhone,OpeningBalance,ClosingBalance,Pincode,LedgerStateName,Address</FETCH>' +
      '</COLLECTION>' +
      '</TDLMESSAGE></TDL>' +
      '</DESC>' +
      '</BODY>' +
      '</ENVELOPE>';

    console.log('Connecting to Tally at ' + TALLY_HOST + ':' + TALLY_PORT + ' (company: ' + COMPANY + ')...');

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
    req.on('timeout', () => { req.destroy(); reject(new Error('Tally timeout - make sure Tally is open and on main screen')); });
    req.write(payload);
    req.end();
  });
}

function parseLedgers(xml) {
  const ledgers = [];
  const re = /LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const name = clean(m[1]);
    const body = m[2];
    const addressLines = [];
    let mobile = '';

    const addrRe = /ADDRESS[^>]*>([^<]*)<\/ADDRESS/gi;
    let aM;
    while ((aM = addrRe.exec(body)) !== null) {
      const line = clean(aM[1]);
      if (!line) continue;
      if (/^\d{10}$/.test(line)) { if (!mobile) mobile = line; }
      else if (!addressLines.includes(line)) addressLines.push(line);
    }

    const pinM = body.match(/PINCODE[^>]*>([^<]*)<\/PINCODE/i);
    let pincode = pinM ? clean(pinM[1]) : '';
    if (!pincode && addressLines.length) {
      const hit = addressLines.join(' ').match(/\b(\d{6})\b/);
      if (hit) pincode = hit[1];
    }

    const stateM = body.match(/<STATE[^>]*>([^<]*)<\/STATE/i) || body.match(/LEDGERSTATENAME[^>]*>([^<]*)<\/LEDGERSTATENAME/i);
    const state = stateM ? clean(stateM[1]) : '';

    const mobileM = body.match(/LEDGERMOBILE[^>]*>([^<]*)<\/LEDGERMOBILE/i) || body.match(/LEDGERPHONE[^>]*>([^<]*)<\/LEDGERPHONE/i);
    if (mobileM) { const ph = clean(mobileM[1]).replace(/^PH\s*/i, '').trim(); if (ph) mobile = ph; }

    const gstinM = body.match(/PARTYGSTIN[^>]*>([^<]*)<\/PARTYGSTIN/i) || body.match(/GSTIN[^>]*>([^<]*)<\/GSTIN/i);
    const gstin = gstinM ? clean(gstinM[1]).toUpperCase() : '';

    const fullAddr = addressLines.join(', ') || null;
    if (name) ledgers.push({ name, fullAddr, pincode: pincode || null, state: state || null, mobile: mobile || null, gstin: gstin || null });
  }
  return ledgers;
}

async function run() {
  console.log('=================================================================');
  console.log('    TALLY -> ERP CONTACT ADDRESS SYNC');
  console.log('=================================================================\n');

  let xml;
  try { xml = await fetchLedgersFromTally(); }
  catch (err) { console.error('Cannot reach Tally:', err.message); process.exit(1); }

  if (!xml || !xml.includes('LEDGER NAME')) {
    console.log('Tally response (first 500 chars):', xml ? xml.substring(0, 500) : '(empty)');
    console.error('No ledger data in Tally response.');
    process.exit(1);
  }
  console.log('Got response from Tally\n');

  const tallyLedgers = parseLedgers(xml);
  console.log('Parsed ' + tallyLedgers.length + ' ledgers from Tally\n');

  const { data: erpContacts, error: loadErr } = await supabase
    .from('contact')
    .select('id, name, tally_ledger_name, billing_address_line1, billing_pincode, phone, gstin')
    .range(0, 9999)
    .eq('organization_id', DEFAULT_ORG_ID);

  if (loadErr) { console.error('DB load failed:', loadErr.message); process.exit(1); }
  console.log('Loaded ' + erpContacts.length + ' contacts from ERP DB\n');

  const erpByName = new Map();
  for (const c of erpContacts) {
    const key = (c.tally_ledger_name || c.name || '').toLowerCase().trim();
    if (key) erpByName.set(key, c);
  }

  let updated = 0, noAddress = 0, notFound = 0, errors = 0;

  for (const ledger of tallyLedgers) {
    const existing = erpByName.get(ledger.name.toLowerCase().trim());
    if (!existing) { notFound++; continue; }
    if (!ledger.fullAddr && !ledger.pincode) { noAddress++; continue; }

    const update = {};
    if (ledger.fullAddr)  update.billing_address_line1 = ledger.fullAddr;
    if (ledger.pincode)   { update.billing_pincode = ledger.pincode; update.pincode = ledger.pincode; }
    if (ledger.state)     { update.billing_state = ledger.state; update.state = ledger.state; }
    if (ledger.mobile && !existing.phone) update.phone = ledger.mobile;
    if (ledger.gstin && !existing.gstin) { update.gstin = ledger.gstin; update.tax_number = ledger.gstin; update.gst_number = ledger.gstin; }

    const { error: updErr } = await supabase.from('contact').update(update).eq('id', existing.id);
    if (updErr) { console.error('  Failed to update ' + ledger.name + ':', updErr.message); errors++; }
    else {
      updated++;
      if (updated <= 10 || updated % 100 === 0) {
        console.log('  [' + updated + '] ' + ledger.name + ' -> ' + (ledger.fullAddr || '(no addr)') + (ledger.pincode ? ' PIN:' + ledger.pincode : ''));
      }
    }
  }

  console.log('\n=================================================================');
  console.log('  Updated with address : ' + updated);
  console.log('  No address in Tally  : ' + noAddress);
  console.log('  Not found in ERP DB  : ' + notFound);
  console.log('  Errors               : ' + errors);
  console.log('=================================================================\n');
  console.log('Address sync complete!');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
