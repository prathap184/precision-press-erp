const http = require('http');

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
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.write(xmlPayload);
    req.end();
  });
}

async function run() {
  const reqXml = `
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
     <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
     <ACCOUNTTYPE>Stock Items</ACCOUNTTYPE>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

  const buf = await fetchLiveTally(reqXml);
  console.log(`Received ${buf.length} bytes from All Masters request.`);

  // Check 3m black back vinyl in the response
  const xmlStr = buf.toString('utf8');
  const match = xmlStr.match(/<STOCKITEM NAME="3m black back vinyl \( Plain \)"[\s\S]*?<\/STOCKITEM>/i);
  if (match) {
    const b = match[0];
    console.log('--- 3m Black Back Vinyl with All Masters ---');
    console.log('OPENINGBALANCE:', b.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i)?.[1]);
    console.log('OPENINGRATE   :', b.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i)?.[1]);
    console.log('OPENINGVALUE  :', b.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i)?.[1]);
  } else {
    console.log('Item not found, first 1000 chars:');
    console.log(xmlStr.substring(0, 1000));
  }
}

run().catch(console.error);
