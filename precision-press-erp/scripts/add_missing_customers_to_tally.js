// scripts/add_missing_customers_to_tally.js
// Finds all customers referenced in tally_sync_queue and creates their Sundry Debtor ledgers in Tally
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config({ path: 'tally-connector/.env' });

const TALLY_URL = `${process.env.TALLY_HOST || 'http://localhost'}:${process.env.TALLY_PORT || 9000}`;
const COMPANY   = 'Hindustan Enterprises 25-26';

async function createLedgerInTally(customerName) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${COMPANY}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${customerName}" ACTION="Create">
            <NAME>${customerName}</NAME>
            <PARENT>Sundry Debtors</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
            <AFFECTSSTOCK>No</AFFECTSSTOCK>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await axios.post(TALLY_URL, xml, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 15000,
    });
    const data = res.data;
    const created   = (data.match(/<CREATED>(\d+)<\/CREATED>/)  || [])[1] || '0';
    const altered   = (data.match(/<ALTERED>(\d+)<\/ALTERED>/)  || [])[1] || '0';
    const errors    = (data.match(/<ERRORS>(\d+)<\/ERRORS>/)    || [])[1] || '0';
    const lineError = (data.match(/<LINEERROR>(.*?)<\/LINEERROR>/) || [])[1] || '';

    if (parseInt(created) > 0) {
      console.log(`  ✅ CREATED: ${customerName}`);
    } else if (parseInt(altered) > 0) {
      console.log(`  ✏️  ALREADY EXISTS (altered): ${customerName}`);
    } else if (lineError.toLowerCase().includes('already exists')) {
      console.log(`  ✏️  ALREADY EXISTS: ${customerName}`);
    } else {
      console.log(`  ❌ FAILED: ${customerName} → ${lineError}`);
    }
  } catch (err) {
    console.error(`  ❌ ERROR: ${customerName} → ${err.message}`);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all unique customer names from pending queue items
  const { data: queue, error } = await supabase
    .from('tally_sync_queue')
    .select('payload, customerName')
    .in('status', ['PENDING', 'FAILED']);

  if (error) {
    console.error('DB Error:', error);
    return;
  }

  const customerNames = new Set();
  for (const item of queue || []) {
    const name = item.customerName || item.payload?.customerName || item.payload?.debtorLedgerName;
    if (name) customerNames.add(name.trim());
  }

  if (customerNames.size === 0) {
    console.log('No customers found in queue!');
    return;
  }

  console.log(`\n=== Creating ${customerNames.size} customer(s) in Tally ===`);
  for (const name of customerNames) {
    console.log(`\n→ Processing: ${name}`);
    await createLedgerInTally(name);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n✅ Done! Now run: node tally-connector/connector.js');
}

main().catch(console.error);
