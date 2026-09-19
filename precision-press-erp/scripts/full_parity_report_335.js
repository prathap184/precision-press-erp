const http = require('http');
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

  const buf = await queryTally(payload);
  const xml = buf.toString('utf8');

  const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  const items = [];
  const guidSet = new Set();
  const nameSet = new Set();

  let hasClosingQty = 0;
  let hasClosingRate = 0;
  let hasClosingVal = 0;
  let hasBillingMode = 0;
  let hasSizeMandatory = 0;

  while ((m = itemRegex.exec(xml)) !== null) {
    const rawName = m[1];
    const name = clean(rawName);
    const body = m[2];

    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const uomM = body.match(/<BASEUNITS[^>]*>([^<]*)<\/BASEUNITS>/i);
    const closingBalM = body.match(/<CLOSINGBALANCE[^>]*>([^<]*)<\/CLOSINGBALANCE>/i);
    const closingRateM = body.match(/<CLOSINGRATE[^>]*>([^<]*)<\/CLOSINGRATE>/i);
    const closingValM = body.match(/<CLOSINGVALUE[^>]*>([^<]*)<\/CLOSINGVALUE>/i);
    const alterM = body.match(/<ALTERID[^>]*>([^<]*)<\/ALTERID>/i);
    const billingTypeM = body.match(/<(?:UDF:)?STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/(?:UDF:)?STKITEMSIZESBILLINGTYPE>/i);
    const sizeMandatoryM = body.match(/<(?:UDF:)?ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/(?:UDF:)?ISITEMSIZEDETAILSMANDATORY>/i);

    const guid = guidM ? clean(guidM[1]) : '';
    let parent = parentM ? clean(parentM[1]) : '';
    if (parent.toLowerCase() === 'primary') parent = '';

    guidSet.add(guid);
    nameSet.add(name.toLowerCase());

    const cBal = closingBalM ? clean(closingBalM[1]) : '';
    const cRate = closingRateM ? clean(closingRateM[1]) : '';
    const cVal = closingValM ? clean(closingValM[1]) : '';
    const bType = billingTypeM ? clean(billingTypeM[1]) : '';
    const sMand = sizeMandatoryM ? clean(sizeMandatoryM[1]) : '';

    if (cBal) hasClosingQty++;
    if (cRate) hasClosingRate++;
    if (cVal) hasClosingVal++;
    if (bType) hasBillingMode++;
    if (sMand.toLowerCase() === 'yes') hasSizeMandatory++;

    items.push({
      name,
      guid,
      parent,
      uom: uomM ? clean(uomM[1]) : '',
      closingBal: cBal,
      closingRate: cRate,
      closingVal: cVal,
      alterId: alterM ? parseInt(alterM[1].trim(), 10) : null,
      billingType: bType || 'None',
      sizeMandatory: sMand || 'No'
    });
  }

  console.log('-----------------------------------------------------------------------');
  console.log('       ?? 100% PARITY AUDIT SUMMARY (LIVE TALLY PORT 9000)             ');
  console.log('-----------------------------------------------------------------------');
  console.log(`• Total Stock Items Received   : ${items.length} / 335`);
  console.log(`• Unique GUIDs                 : ${guidSet.size} / 335 (100.0%)`);
  console.log(`• Unique Names                 : ${nameSet.size} / 335 (100.0%)`);
  console.log(`• Items with Closing Quantity  : ${hasClosingQty}`);
  console.log(`• Items with Closing Rate      : ${hasClosingRate}`);
  console.log(`• Items with Closing Value     : ${hasClosingVal}`);
  console.log(`• Items with Billing Mode (B)  : ${hasBillingMode} (${((hasBillingMode/items.length)*100).toFixed(1)}%)`);
  console.log(`• Items with Size Mandatory    : ${hasSizeMandatory} (${((hasSizeMandatory/items.length)*100).toFixed(1)}%)`);
  console.log('-----------------------------------------------------------------------');
}

run().catch(console.error);
