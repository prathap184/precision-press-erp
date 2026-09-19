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
        timeout: 15000,
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

async function testClosing() {
  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
        <TDL>
          <TDLMESSAGE>
            <COLLECTION NAME="LedgerCollection" ISMODIFY="No">
              <TYPE>Ledger</TYPE>
              <FETCH>Name,Parent,Guid,AlterId,OpeningBalance,ClosingBalance</FETCH>
            </COLLECTION>
          </TDLMESSAGE>
        </TDL>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await postToTally(xml);
    console.log('Response length:', res.length);
    const targets = ['Cash', 'EVIZ', 'ICICI 4349'];
    for (const t of targets) {
      const reg = new RegExp('<LEDGER\\s+NAME="' + t + '"[^>]*>([\\s\\S]*?)<\\/LEDGER>', 'i');
      const m = res.match(reg);
      if (m) {
        const ob = (m[1].match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i) || [])[1];
        const cb = (m[1].match(/<CLOSINGBALANCE>([^<]*)<\/CLOSINGBALANCE>/i) || [])[1];
        console.log(`${t} -> Opening: ${ob} | Closing: ${cb}`);
      } else {
        console.log(`${t} NOT FOUND in response`);
      }
    }
    if (res.slice(0, 300).includes('LINEERROR')) {
      console.log('Error snippet:', res.slice(0, 300));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testClosing();
