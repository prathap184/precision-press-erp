/**
 * RAW TALLY DUMP — See exactly what Tally returns
 */
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';

async function run() {
  console.log('🔍 Getting raw data from Tally...\n');

  // Request 1: Get company info
  const companyXml = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
        <REPORTNAME>List of Accounts</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  // Request 2: Get ledgers without company name
  const ledgerXml = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Ledgers</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  // Request 3: Get company name specifically
  const companyNameXml = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Companies</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  const requests = [
    { name: 'List of Accounts', xml: companyXml },
    { name: 'List of Ledgers (no company)', xml: ledgerXml },
    { name: 'List of Companies', xml: companyNameXml },
  ];

  for (const req of requests) {
    try {
      console.log(`── ${req.name} ──`);
      const res = await axios.post(TALLY_URL, req.xml, {
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        timeout: 15000,
        responseType: 'text',
      });
      
      const raw = res.data;
      console.log(raw.substring(0, 3000));
      console.log('─────────────────────────────────────\n');

      // Save full response
      const filename = `raw_${req.name.replace(/\s+/g, '_').toLowerCase()}.xml`;
      fs.writeFileSync(path.join(__dirname, filename), raw);
      console.log(`💾 Saved full response to: ${filename}\n`);
    } catch (err) {
      console.log(`❌ ${err.message}\n`);
    }
  }
}

run();
