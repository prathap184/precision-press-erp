const http = require('http');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

function queryTally(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function clean(str) {
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

async function run() {
  console.log('-----------------------------------------------------------------------');
  console.log('    ?? DEEP LIVE AUDIT: TALLY PORT 9000 ? ERP DATABASE');
  console.log('-----------------------------------------------------------------------\n');

  // 1. Fetch live TDL Collection from Tally Port 9000
  const payload = `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>StockItemCollection</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="StockItemCollection" ISMODIFY="No">
      <TYPE>StockItem</TYPE>
      <FETCH>Name,Parent,Guid,AlterId,BaseUnits,OpeningRate,OpeningValue,ClosingRate,ClosingValue,OpeningBalance,ClosingBalance,IsItemSizeDetailsMandatory,StkItemSizesBillingType,HsnCode</FETCH>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;

  console.log('?? Fetching StockItemCollection directly from Live Tally Port 9000...');
  const buf = await queryTally(payload);
  console.log(`? Live Tally returned ${buf.length} bytes.`);
  const xml = buf.toString('utf8');

  // Parse all stock items from live TDL response
  const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  const liveItems = [];
  const liveGuidSet = new Set();
  const liveNameSet = new Set();
  const duplicateGuids = [];
  const duplicateNames = [];

  while ((m = itemRegex.exec(xml)) !== null) {
    const rawName = m[1];
    const name = clean(rawName);
    const body = m[2];

    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const uomM = body.match(/<BASEUNITS[^>]*>([^<]*)<\/BASEUNITS>/i);
    const openBalM = body.match(/<OPENINGBALANCE[^>]*>([^<]*)<\/OPENINGBALANCE>/i);
    const openRateM = body.match(/<OPENINGRATE[^>]*>([^<]*)<\/OPENINGRATE>/i);
    const openValM = body.match(/<OPENINGVALUE[^>]*>([^<]*)<\/OPENINGVALUE>/i);
    const closingBalM = body.match(/<CLOSINGBALANCE[^>]*>([^<]*)<\/CLOSINGBALANCE>/i);
    const closingRateM = body.match(/<CLOSINGRATE[^>]*>([^<]*)<\/CLOSINGRATE>/i);
    const closingValM = body.match(/<CLOSINGVALUE[^>]*>([^<]*)<\/CLOSINGVALUE>/i);
    const alterM = body.match(/<ALTERID[^>]*>([^<]*)<\/ALTERID>/i);
    const billingTypeM = body.match(/<(?:UDF:)?STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/(?:UDF:)?STKITEMSIZESBILLINGTYPE>/i);
    const sizeMandatoryM = body.match(/<(?:UDF:)?ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/(?:UDF:)?ISITEMSIZEDETAILSMANDATORY>/i);
    const hsnM = body.match(/<HSNCODE[^>]*>([^<]*)<\/HSNCODE>/i);

    const guid = guidM ? clean(guidM[1]) : '';
    let parent = parentM ? clean(parentM[1]) : '';
    if (parent.toLowerCase() === 'primary') parent = '';

    if (liveGuidSet.has(guid)) duplicateGuids.push({ name, guid });
    liveGuidSet.add(guid);

    if (liveNameSet.has(name.toLowerCase())) duplicateNames.push(name);
    liveNameSet.add(name.toLowerCase());

    liveItems.push({
      name,
      guid,
      parent,
      uom: uomM ? clean(uomM[1]) : '',
      openBal: openBalM ? clean(openBalM[1]) : '',
      openRate: openRateM ? clean(openRateM[1]) : '',
      openVal: openValM ? clean(openValM[1]) : '',
      closingBal: closingBalM ? clean(closingBalM[1]) : '',
      closingRate: closingRateM ? clean(closingRateM[1]) : '',
      closingVal: closingValM ? clean(closingValM[1]) : '',
      alterId: alterM ? parseInt(alterM[1].trim(), 10) : null,
      billingType: billingTypeM ? clean(billingTypeM[1]) : null,
      sizeMandatory: sizeMandatoryM ? clean(sizeMandatoryM[1]) : null,
      hsnCode: hsnM ? clean(hsnM[1]) : null
    });
  }

  console.log(`\n?? Live Tally Port 9000 Stock Items Parsed : ${liveItems.length}`);
  console.log(`• Unique GUIDs                            : ${liveGuidSet.size}`);
  console.log(`• Duplicate GUIDs                         : ${duplicateGuids.length}`);
  console.log(`• Unique Names                            : ${liveNameSet.size}`);
  console.log(`• Duplicate Names                         : ${duplicateNames.length}`);

  // 2. Cross-check categories in Database
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const catRes = await pg.query('SELECT id, name FROM public.inventory_category');
  const catMap = new Map();
  catRes.rows.forEach(r => catMap.set(r.name.toLowerCase().trim(), r.id));

  let matchedToDbCategory = 0;
  let topLevelCount = 0;
  const unmappedGroups = new Set();

  liveItems.forEach(item => {
    if (!item.parent) {
      topLevelCount++;
    } else {
      const dbId = catMap.get(item.parent.toLowerCase());
      if (dbId) matchedToDbCategory++;
      else unmappedGroups.add(item.parent);
    }
  });

  console.log(`\n?? Stock Groups Hierarchy Verification:`);
  console.log(`• Total Synced Categories in Database     : ${catMap.size}`);
  console.log(`• Items linked to DB Category ID          : ${matchedToDbCategory}`);
  console.log(`• Primary / Top-Level Items (parent = '') : ${topLevelCount}`);
  console.log(`• Total Items Validated                   : ${matchedToDbCategory + topLevelCount} / ${liveItems.length}`);
  if (unmappedGroups.size > 0) {
    console.log(`?? Unmapped Groups Found:`, Array.from(unmappedGroups));
  } else {
    console.log(`? 100.0% OF ALL STOCK ITEMS MAP EXACTLY TO THE ERP CATEGORIES!`);
  }

  // 3. Check UOM Distribution
  const uomCounts = {};
  liveItems.forEach(i => {
    uomCounts[i.uom || 'N/A'] = (uomCounts[i.uom || 'N/A'] || 0) + 1;
  });
  console.log(`\n?? Unit of Measure (UOM) Distribution:`);
  console.table(uomCounts);

  // 4. Sample 5 Items Field-by-Field
  console.log(`\n?? Sample 5 Stock Items (Every Field Verified from Port 9000):`);
  console.table(liveItems.slice(0, 5));

  await pg.end();
}

run().catch(console.error);
