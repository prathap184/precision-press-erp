const http = require('http');
const fs = require('fs');

function fetchLiveTally(xmlPayload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xmlPayload)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.write(xmlPayload);
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
  console.log('?? Fetching Stock Items directly from Live Tally Port 9000...');
  const exportPayload = `
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>List of Accounts</REPORTNAME>
    <STATICVARIABLES>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
     <ACCOUNTTYPE>Stock Items</ACCOUNTTYPE>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

  const liveXml = await fetchLiveTally(exportPayload);
  console.log(`? Live Tally returned ${liveXml.length} bytes.`);

  function parseItems(xmlStr) {
    const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
    let m;
    const map = new Map();
    while ((m = itemRegex.exec(xmlStr)) !== null) {
      const name = clean(m[1]);
      const body = m[2];

      const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
      const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
      const uomM = body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
      const openBalM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
      const openRateM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);
      const openValM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
      const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
      const billingTypeM = body.match(/<(?:UDF:)?STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/(?:UDF:)?STKITEMSIZESBILLINGTYPE>/i);
      const sizeMandatoryM = body.match(/<(?:UDF:)?ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/(?:UDF:)?ISITEMSIZEDETAILSMANDATORY>/i);

      map.set(name.toLowerCase(), {
        name,
        guid: guidM ? clean(guidM[1]) : '',
        parent: parentM ? clean(parentM[1]) : '',
        uom: uomM ? clean(uomM[1]) : '',
        openBal: openBalM ? clean(openBalM[1]) : '0',
        openRate: openRateM ? clean(openRateM[1]) : '0',
        openVal: openValM ? clean(openValM[1]) : '0',
        alterId: alterM ? parseInt(alterM[1].trim(), 10) : null,
        billingType: billingTypeM ? clean(billingTypeM[1]) : null,
        sizeMandatory: sizeMandatoryM ? clean(sizeMandatoryM[1]) : null
      });
    }
    return map;
  }

  function readXmlFile(p) {
    const b = fs.readFileSync(p);
    if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
    return b.toString('utf8');
  }

  const liveMap = parseItems(liveXml);
  const fileMap = parseItems(readXmlFile('C:\\Users\\jprat\\Videos\\items.xml'));

  console.log(`Live items parsed: ${liveMap.size}`);
  console.log(`File items parsed: ${fileMap.size}`);

  // Find if any items are in file but not live, or vice versa
  const missingInLive = [];
  const missingInFile = [];

  for (const [k, v] of fileMap) {
    if (!liveMap.has(k)) missingInLive.push(v.name);
  }
  for (const [k, v] of liveMap) {
    if (!fileMap.has(k)) missingInFile.push(v.name);
  }

  console.log(`Items in file but missing in live: ${missingInLive.length}`, missingInLive);
  console.log(`Items in live but missing in file: ${missingInFile.length}`, missingInFile);

  // Compare matching items
  let guidMatch = 0, groupMatch = 0, uomMatch = 0, balMatch = 0, rateMatch = 0, valMatch = 0, billMatch = 0;
  const valDiffs = [];

  for (const [k, f] of fileMap) {
    const l = liveMap.get(k);
    if (!l) continue;

    if (f.guid === l.guid) guidMatch++;
    if (f.parent === l.parent) groupMatch++;
    if (f.uom === l.uom) uomMatch++;
    if (f.openBal === l.openBal) balMatch++;
    else valDiffs.push({ name: f.name, field: 'openBal', file: f.openBal, live: l.openBal });

    if (f.openRate === l.openRate) rateMatch++;
    if (f.openVal === l.openVal) valMatch++;
    if (f.billingType === l.billingType) billMatch++;
  }

  const commonCount = fileMap.size - missingInLive.length;
  console.log(`\n--- Cross Check of ${commonCount} Common Items ---`);
  console.log(`GUID matches: ${guidMatch} / ${commonCount}`);
  console.log(`Group matches: ${groupMatch} / ${commonCount}`);
  console.log(`UOM matches: ${uomMatch} / ${commonCount}`);
  console.log(`Opening Bal matches: ${balMatch} / ${commonCount}`);
  console.log(`Opening Rate matches: ${rateMatch} / ${commonCount}`);
  console.log(`Opening Value matches: ${valMatch} / ${commonCount}`);
  console.log(`Billing Type matches: ${billMatch} / ${commonCount}`);

  if (valDiffs.length > 0) {
    console.log(`\nSample ${valDiffs.length} Opening Balance differences between file and live:`);
    console.table(valDiffs.slice(0, 10));
  }
}

run().catch(console.error);
