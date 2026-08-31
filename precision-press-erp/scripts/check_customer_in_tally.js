// scripts/check_customer_in_tally.js
// Queries TallyPrime directly for the ledger
const axios = require('axios');
require('dotenv').config({ path: 'tally-connector/.env' });

const TALLY_URL = `${process.env.TALLY_HOST || 'http://localhost'}:${process.env.TALLY_PORT || 9000}`;

async function checkLedger(name) {
  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Hindustan Enterprises 25-26</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
  try {
    const res = await axios.post(TALLY_URL, xml, { headers: { 'Content-Type': 'text/xml' } });
    const data = res.data;
    // search for festive
    const lines = data.split('\n').filter(l => l.toLowerCase().includes('festive'));
    if (lines.length) {
      console.log('✅ Found in Tally:');
      lines.forEach(l => console.log(l.trim()));
    } else {
      console.log('❌ "Festive Events" NOT found in Tally ledgers!');
      console.log('   The customer must be created in Tally first.');
      console.log('\n📋 Options:');
      console.log('   1. Run: node tally-connector/sync-customers.js  (sync all customers from ERP to Tally)');
      console.log('   2. Manually create the ledger in Tally under Sundry Debtors');
    }
  } catch (err) {
    console.error('Error connecting to Tally:', err.message);
  }
}

checkLedger('Festive Events');
