const http = require('http');

function queryTally(xml) {
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
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(xml);
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
    <REPORTNAME>List of Accounts</REPORTNAME>
    <STATICVARIABLES>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
     <ACCOUNTTYPE>Stock Items</ACCOUNTTYPE>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

  const resp = await queryTally(reqXml);
  console.log('--- First 1000 characters of Live Response ---');
  console.log(resp.substring(0, 1000));
}

run().catch(console.error);
