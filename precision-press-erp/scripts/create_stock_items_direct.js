// scripts/create_stock_items_direct.js
require('dotenv').config({ path: 'tally-connector/.env' });
const axios = require('axios');

const TALLY_URL = `${process.env.TALLY_HOST || 'http://localhost'}:${process.env.TALLY_PORT || 9000}`;
const COMPANY = 'Hindustan Enterprises 25-26';

const stockItems = [
  '01 Acrylic Premium 1.0mm (2 FT x 8 FT)',
  '01 Acrylic Premium 1.0mm (4 FT x 5 FT)',
  '01 Acrylic Premium 1.0mm (2 FT x 2 FT)',
  '01 Acrylic Premium 1.0mm (3 FT x 2 FT)',
  '01 Acrylic Premium 1.0mm (5 FT x 5 FT)'
];

async function main() {
  for (const name of stockItems) {
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
          <STOCKITEM NAME="${name}" ACTION="Create">
            <NAME>${name}</NAME>
            <PARENT/>
            <BASEUNITS>N</BASEUNITS>
            <ISADDABLE>Yes</ISADDABLE>
            <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
            <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
          </STOCKITEM>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    try {
      const res = await axios.post(TALLY_URL, xml, { headers: { 'Content-Type': 'text/xml' } });
      const created = (res.data.match(/<CREATED>(\d+)<\/CREATED>/) || [])[1] || '0';
      const altered = (res.data.match(/<ALTERED>(\d+)<\/ALTERED>/) || [])[1] || '0';
      const lineerror = (res.data.match(/<LINEERROR>(.*?)<\/LINEERROR>/) || [])[1] || '';

      if (parseInt(created) > 0) {
        console.log(`  ✅ CREATED Stock Item: ${name}`);
      } else if (parseInt(altered) > 0 || lineerror.includes('already exists')) {
        console.log(`  ✏️ ALREADY EXISTS: ${name}`);
      } else {
        console.log(`  ❌ ${name} → ${lineerror}`);
      }
    } catch (err) {
      console.error(`  ❌ Error on ${name}:`, err.message);
    }
  }
}

main().catch(console.error);
