const http = require('http');

function postToTally(xml) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      'http://127.0.0.1:9000',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(xml),
        },
        timeout: 20000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', (err) => reject(err));
    req.write(xml);
    req.end();
  });
}

async function testBankSummary() {
  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Group Summary</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>20240401</SVFROMDATE>
          <SVTODATE>20260919</SVTODATE>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <GROUPNAME>Bank Accounts</GROUPNAME>
          <SVGROUPNAME>Bank Accounts</SVGROUPNAME>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await postToTally(xml);
    console.log('Group Summary Response length:', res.length);
    console.log('Snippet:', res.slice(0, 1000));
    
    ['EVIZ', 'ICICI 4349'].forEach(t => {
      const idx = res.indexOf(t);
      console.log(`Searching for "${t}": found at index ${idx}`);
      if (idx !== -1) {
        console.log(`Around ${t}:\n`, res.slice(Math.max(0, idx - 50), idx + 250));
      }
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testBankSummary();
