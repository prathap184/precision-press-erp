const fs = require('fs');
const http = require('http');

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

// 1. Inspect date tags in items.xml
const fileXml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
const fileDates = [...fileXml.matchAll(/<(?:MFDON|DATE|FROMDATE|TODATE)[^>]*>([^<]+)<\//gi)].slice(0, 10);
console.log('Sample dates in items.xml:', fileDates.map(m => m[0]));

// 2. Fetch with binary buffer and decode UTF-8 from Port 9000
function fetchBuffer(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml)
      },
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

async function checkLive() {
  const reqXml = `
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

  const buf = await fetchBuffer(reqXml);
  const liveXml = buf.toString('utf8');

  // Check bullet item in liveXml
  const bulletMatches = liveXml.match(/Backlit Star Backlit[^<]+/i);
  console.log('Live bullet item decoded as UTF-8:', bulletMatches ? bulletMatches[0] : 'None');

  // Check 3m black back vinyl in both
  const file3m = fileXml.match(/<STOCKITEM NAME="3m black back vinyl \( Plain \)"[\s\S]*?<\/STOCKITEM>/i);
  const live3m = liveXml.match(/<STOCKITEM NAME="3m black back vinyl \( Plain \)"[\s\S]*?<\/STOCKITEM>/i);

  console.log('\n--- items.xml 3m Black Back Vinyl ---');
  if (file3m) {
    const b = file3m[0];
    console.log('OPENINGBALANCE:', b.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i)?.[1]);
    console.log('OPENINGRATE   :', b.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i)?.[1]);
    console.log('OPENINGVALUE  :', b.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i)?.[1]);
    console.log('BATCH BAL     :', b.match(/<BATCHALLOCATIONS\.LIST>[\s\S]*?<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i)?.[1]);
    console.log('ALTERID       :', b.match(/<ALTERID>([^<]*)<\/ALTERID>/i)?.[1]);
    console.log('MFDON         :', b.match(/<MFDON>([^<]*)<\/MFDON>/i)?.[1]);
  }

  console.log('\n--- Live Port 9000 3m Black Back Vinyl ---');
  if (live3m) {
    const b = live3m[0];
    console.log('OPENINGBALANCE:', b.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i)?.[1]);
    console.log('OPENINGRATE   :', b.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i)?.[1]);
    console.log('OPENINGVALUE  :', b.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i)?.[1]);
    console.log('BATCH BAL     :', b.match(/<BATCHALLOCATIONS\.LIST>[\s\S]*?<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i)?.[1]);
    console.log('ALTERID       :', b.match(/<ALTERID>([^<]*)<\/ALTERID>/i)?.[1]);
    console.log('MFDON         :', b.match(/<MFDON>([^<]*)<\/MFDON>/i)?.[1]);
  }
}

checkLive().catch(console.error);
