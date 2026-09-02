// scripts/create_missing_stock_items.js
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: 'tally-connector/.env' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { buildStockItemXML } = require('../tally-connector/xml-builder');

const TALLY_URL = `${process.env.TALLY_HOST || 'http://localhost'}:${process.env.TALLY_PORT || 9000}`;
const COMPANY = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

async function createStockItems() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: queue } = await supabase
    .from('tally_sync_queue')
    .select('payload')
    .eq('syncType', 'SALES_INVOICE');

  const itemsMap = new Map();

  (queue || []).forEach(q => {
    (q.payload?.items || []).forEach(item => {
      if (item.productName) {
        itemsMap.set(item.productName, {
          name: item.productName,
          baseUnits: item.unit || 'Sq.Ft',
          parentGroup: 'Primary',
          taxRate: item.taxRate || 18,
          hsnCode: item.hsnCode || '3920',
        });
      }
    });
  });

  console.log(`Found ${itemsMap.size} unique stock items in invoices:`);

  for (const [name, item] of itemsMap) {
    console.log(`\nCreating Stock Item in Tally: "${name}"...`);

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
            <PARENT>Primary</PARENT>
            <BASEUNITS>N</BASEUNITS>
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
        console.log(`  ✅ CREATED: ${name}`);
      } else if (parseInt(altered) > 0 || lineerror.includes('already exists')) {
        console.log(`  ✏️ ALREADY EXISTS: ${name}`);
      } else {
        console.log(`  ❌ Response: ${lineerror || 'errors'}`);
      }
    } catch (err) {
      console.error(`  ❌ Error:`, err.message);
    }
  }

  // Reset the failed invoices back to PENDING
  await supabase
    .from('tally_sync_queue')
    .update({ status: 'PENDING', lastError: null })
    .in('voucherId', ['INV-00044', 'INV-00045', 'INV-00046', 'INV-00047']);

  console.log('\n✅ Stock Items synced and failed invoices reset to PENDING!');
}

createStockItems().catch(console.error);
