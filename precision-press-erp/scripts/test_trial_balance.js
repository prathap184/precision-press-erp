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

async function testTrialBalance() {
  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <ISITEMWISE>No</ISITEMWISE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await postToTally(xml);
    console.log('Trial Balance Response length:', res.length);
    console.log('Snippet:', res.slice(0, 500));
    
    const targets = ['Cash', 'EVIZ', 'ICICI 4349'];
    for (const t of targets) {
      const idx = res.indexOf(t);
      console.log(`Searching for "${t}": found at index ${idx}`);
      if (idx !== -1) {
        console.log(`Context around ${t}:\n`, res.slice(Math.max(0, idx - 100), idx + 300));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testTrialBalance();
