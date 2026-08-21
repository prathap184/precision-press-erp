const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TALLY_URL = 'http://localhost:9000';
const LEDGERS_FILE = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function importLedgersSafe() {
  console.log('Reading listofledgers.xml...');
  const xmlContent = fs.readFileSync(LEDGERS_FILE, 'utf8');
  
  const msgRegex = /<TALLYMESSAGE\b[^>]*>([\s\S]*?)<\/TALLYMESSAGE>/gi;
  const messages = [];
  let m;
  while ((m = msgRegex.exec(xmlContent)) !== null) {
    messages.push(m[0]);
  }

  console.log(`Found ${messages.length} ledgers to import.`);
  const chunkSize = 10;
  let created = 0;
  let altered = 0;
  let errors = 0;

  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const envelope = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>Hindustan Enterprises 25-26</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    ${chunk.join('\n    ')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

    try {
      const res = await axios.post(TALLY_URL, envelope, {
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        timeout: 15000
      });

      const txt = String(res.data);
      const cM = txt.match(/<CREATED>(\d+)<\/CREATED>/i);
      const aM = txt.match(/<ALTERED>(\d+)<\/ALTERED>/i);
      const eM = txt.match(/<ERRORS>(\d+)<\/ERRORS>/i);

      if (cM) created += parseInt(cM[1], 10);
      if (aM) altered += parseInt(aM[1], 10);
      if (eM) errors += parseInt(eM[1], 10);

      const progress = Math.min(i + chunkSize, messages.length);
      process.stdout.write(`✓ Progress: ${progress}/${messages.length} (Created: ${created}, Altered: ${altered})\r`);
    } catch (err) {
      console.error(`\nChunk error at ${i}: ${err.message}`);
    }

    await sleep(40); // 40ms breather between chunks
  }

  console.log(`\n\n🎉 ALL LEDGERS IMPORTED! Total Created: ${created}, Altered: ${altered}, Errors: ${errors}`);
}

importLedgersSafe().catch(console.error);
