const http = require('http');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const TALLY_HOST = 'localhost';
const TALLY_PORT = 9000;

function fetchLiveTally(xmlPayload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: TALLY_HOST,
      port: TALLY_PORT,
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

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tally Port 9000 connection timeout'));
    });

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
  console.log('?? Testing connection to Live Tally on http://localhost:9000...');

  // 1. First test simple ping/company export
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

  let liveXml = '';
  try {
    liveXml = await fetchLiveTally(exportPayload);
    console.log(`? SUCCESS! Tally Port 9000 connected! Received ${liveXml.length} bytes.`);
  } catch (err) {
    console.error(`? Connection to Tally Port 9000 failed: ${err.message}`);
    return;
  }

  // Parse Stock Items from live Tally Port 9000
  const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  const liveItems = new Map();

  while ((m = itemRegex.exec(liveXml)) !== null) {
    const rawName = m[1];
    const name = clean(rawName);
    const body = m[2];

    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const uomM = body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
    const openBalM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const openRateM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);
    const openValM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
    const closingBalM = body.match(/<CLOSINGBALANCE>([^<]*)<\/CLOSINGBALANCE>/i);
    const closingRateM = body.match(/<CLOSINGRATE>([^<]*)<\/CLOSINGRATE>/i);
    const closingValM = body.match(/<CLOSINGVALUE>([^<]*)<\/CLOSINGVALUE>/i);
    const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const billingTypeM = body.match(/<(?:UDF:)?STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/(?:UDF:)?STKITEMSIZESBILLINGTYPE>/i);
    const sizeMandatoryM = body.match(/<(?:UDF:)?ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/(?:UDF:)?ISITEMSIZEDETAILSMANDATORY>/i);

    const guid = guidM ? clean(guidM[1]) : null;

    liveItems.set(name.toLowerCase(), {
      name,
      guid,
      parent: parentM ? clean(parentM[1]) : '',
      uom: uomM ? clean(uomM[1]) : '',
      openingBal: openBalM ? clean(openBalM[1]) : '0',
      openingRate: openRateM ? clean(openRateM[1]) : '0',
      openingVal: openValM ? clean(openValM[1]) : '0',
      closingBal: closingBalM ? clean(closingBalM[1]) : null,
      closingRate: closingRateM ? clean(closingRateM[1]) : null,
      closingVal: closingValM ? clean(closingValM[1]) : null,
      alterId: alterM ? parseInt(alterM[1].trim(), 10) : null,
      billingType: billingTypeM ? clean(billingTypeM[1]) : null,
      sizeMandatory: sizeMandatoryM ? clean(sizeMandatoryM[1]) : null
    });
  }

  console.log(`?? Live Tally Port 9000 Stock Items Count: ${liveItems.size}`);

  // 2. Read local items.xml to compare against live Port 9000
  function readXmlFile(p) {
    const b = fs.readFileSync(p);
    if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
    return b.toString('utf8');
  }

  const fileXml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
  const fileItems = new Map();
  let fm;
  while ((fm = itemRegex.exec(fileXml)) !== null) {
    const rawName = fm[1];
    const name = clean(rawName);
    const body = fm[2];
    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const uomM = body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
    const openBalM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const openRateM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);
    const openValM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
    const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const billingTypeM = body.match(/<(?:UDF:)?STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/(?:UDF:)?STKITEMSIZESBILLINGTYPE>/i);
    const sizeMandatoryM = body.match(/<(?:UDF:)?ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/(?:UDF:)?ISITEMSIZEDETAILSMANDATORY>/i);

    fileItems.set(name.toLowerCase(), {
      name,
      guid: guidM ? clean(guidM[1]) : null,
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

  console.log(`?? Local items.xml Stock Items Count: ${fileItems.size}`);

  // 3. Compare Live Port 9000 vs items.xml
  let nameMatches = 0;
  let guidMatches = 0;
  let groupMatches = 0;
  let uomMatches = 0;
  let balMatches = 0;
  let rateMatches = 0;
  let valMatches = 0;
  let billingMatches = 0;
  const mismatches = [];

  for (const [key, fileItem] of fileItems.entries()) {
    const liveItem = liveItems.get(key);
    if (!liveItem) {
      mismatches.push({ item: fileItem.name, issue: 'Missing in Live Tally Port 9000' });
      continue;
    }
    nameMatches++;

    if (fileItem.guid === liveItem.guid) guidMatches++;
    else mismatches.push({ item: fileItem.name, issue: `GUID mismatch: file(${fileItem.guid}) vs live(${liveItem.guid})` });

    if (fileItem.parent === liveItem.parent) groupMatches++;
    else mismatches.push({ item: fileItem.name, issue: `Group mismatch: file(${fileItem.parent}) vs live(${liveItem.parent})` });

    if (fileItem.uom === liveItem.uom) uomMatches++;
    else mismatches.push({ item: fileItem.name, issue: `UOM mismatch: file(${fileItem.uom}) vs live(${liveItem.uom})` });

    if (fileItem.openBal === liveItem.openBal) balMatches++;
    else mismatches.push({ item: fileItem.name, issue: `Opening Bal mismatch: file(${fileItem.openBal}) vs live(${liveItem.openBal})` });

    if (fileItem.openRate === liveItem.openRate) rateMatches++;
    else mismatches.push({ item: fileItem.name, issue: `Opening Rate mismatch: file(${fileItem.openRate}) vs live(${liveItem.openRate})` });

    if (fileItem.openVal === liveItem.openVal) valMatches++;
    else mismatches.push({ item: fileItem.name, issue: `Opening Value mismatch: file(${fileItem.openVal}) vs live(${liveItem.openVal})` });

    if (fileItem.billingType === liveItem.billingType) billingMatches++;
    else mismatches.push({ item: fileItem.name, issue: `Billing Type mismatch: file(${fileItem.billingType}) vs live(${liveItem.billingType})` });
  }

  console.log('\n-----------------------------------------------------------------------');
  console.log('       ?? FIELD-BY-FIELD CROSS CHECK: LIVE PORT 9000 ? ITEMS.XML       ');
  console.log('-----------------------------------------------------------------------');
  console.log(`• Total Evaluated Items   : ${fileItems.size}`);
  console.log(`• Exact Name Matches      : ${nameMatches} / ${fileItems.size} (${((nameMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Exact GUID Matches      : ${guidMatches} / ${fileItems.size} (${((guidMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Exact Stock Group Match : ${groupMatches} / ${fileItems.size} (${((groupMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Exact UOM Matches       : ${uomMatches} / ${fileItems.size} (${((uomMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Exact Opening Balance   : ${balMatches} / ${fileItems.size} (${((balMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Exact Opening Rate      : ${rateMatches} / ${fileItems.size} (${((rateMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Exact Opening Value     : ${valMatches} / ${fileItems.size} (${((valMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Exact Billing Type UDF  : ${billingMatches} / ${fileItems.size} (${((billingMatches/fileItems.size)*100).toFixed(1)}%)`);
  console.log(`• Total Discrepancies     : ${mismatches.length}`);

  if (mismatches.length > 0) {
    console.log('\n?? Discrepancies Details (First 10):');
    console.table(mismatches.slice(0, 10));
  } else {
    console.log('\n?? ABSOLUTE 100.0% PARITY! EVERY SINGLE FIELD AND VALUE IS IDENTICAL!');
  }

  // Check closing balances vs opening balances in live Tally
  console.log('\n--- Sample 5 Live Items from Port 9000 ---');
  let sampleCount = 0;
  for (const [k, v] of liveItems.entries()) {
    if (v.openingBal !== '0') {
      console.log({
        name: v.name,
        guid: v.guid,
        group: v.parent || '(Top-Level)',
        uom: v.uom,
        openingBal: v.openingBal,
        openingRate: v.openingRate,
        openingVal: v.openingVal,
        billingType: v.billingType,
        sizeMandatory: v.sizeMandatory
      });
      sampleCount++;
      if (sampleCount >= 5) break;
    }
  }
}

run().catch(console.error);
