const fs = require('fs');
const path = require('path');
const axios = require('axios');

require('dotenv').config();
const ALL_LEDGERS_FILE = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const TARGET_COMPANY = process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isCustomerOrSupplier(parentGroup) {
  if (!parentGroup) return false;
  const p = parentGroup.toLowerCase();
  return (
    p.includes('debtor') ||
    p.includes('creditor') ||
    p.includes('customer') ||
    p.includes('supplier') ||
    p.includes('client') ||
    p.includes('vendor')
  );
}

async function sendChunk(messages) {
  const envelope = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
      <SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    ${messages.join('\n    ')}
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
    return {
      created: cM ? parseInt(cM[1], 10) : 0,
      altered: aM ? parseInt(aM[1], 10) : 0
    };
  } catch (e) {
    return { error: e.message, created: 0, altered: 0 };
  }
}

async function run() {
  console.log('Reading listofledgers.xml...');
  const xml = fs.readFileSync(ALL_LEDGERS_FILE, 'utf8');

  const msgRegex = /<TALLYMESSAGE\b[^>]*>([\s\S]*?)<\/TALLYMESSAGE>/gi;
  const coreMessages = [];
  let m;

  while ((m = msgRegex.exec(xml)) !== null) {
    const block = m[0];
    const parentMatch = block.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parentGroup = parentMatch ? parentMatch[1].trim() : '';

    if (!isCustomerOrSupplier(parentGroup)) {
      coreMessages.push(block);
    }
  }

  console.log(`Found ${coreMessages.length} Core System Ledgers (Banks, Taxes, Sales, Expenses).`);

  const chunkSize = 15;
  let totalCreated = 0;
  let totalAltered = 0;

  for (let i = 0; i < coreMessages.length; i += chunkSize) {
    const chunk = coreMessages.slice(i, i + chunkSize);
    const r = await sendChunk(chunk);
    totalCreated += r.created;
    totalAltered += r.altered;

    const progress = Math.min(i + chunkSize, coreMessages.length);
    process.stdout.write(`✓ Progress: ${progress}/${coreMessages.length} (Created: ${totalCreated}, Altered: ${totalAltered})\r`);
    await sleep(80);
  }

  console.log(`\n\n🎉 Core Ledgers Finished! Total Created: ${totalCreated}, Altered: ${totalAltered}`);
}

run().catch(console.error);
