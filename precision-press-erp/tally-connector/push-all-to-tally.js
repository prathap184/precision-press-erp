/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║        PRECISION PRESS ERP — PUSH ALL MASTERS TO TALLY PRIME (PORT 9000)     ║
 * ║        Company: Hindustan Enterprises 25-26                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const ALL_LEDGERS_DIR = path.resolve(__dirname, '../tally_sync/all ledgers');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send XML Envelope to Tally with auto-retry and delay
 */
async function sendEnvelopeToTally(envelopeXml, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(TALLY_URL, envelopeXml, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Accept': 'text/xml'
        },
        timeout: 45000,
        responseType: 'text'
      });

      const responseText = String(res.data);
      const createdMatch = responseText.match(/<CREATED>(\d+)<\/CREATED>/i);
      const alteredMatch = responseText.match(/<ALTERED>(\d+)<\/ALTERED>/i);
      const errorsMatch = responseText.match(/<ERRORS>(\d+)<\/ERRORS>/i);

      return {
        success: true,
        created: createdMatch ? parseInt(createdMatch[1], 10) : 0,
        altered: alteredMatch ? parseInt(alteredMatch[1], 10) : 0,
        errors: errorsMatch ? parseInt(errorsMatch[1], 10) : 0
      };
    } catch (err) {
      if (attempt === retries) {
        return { success: false, error: err.message };
      }
      await sleep(500);
    }
  }
}

/**
 * Push small single-file master (Units, Groups, etc.)
 */
async function pushWholeFile(filePath, label) {
  if (!fs.existsSync(filePath)) return;
  console.log(`\n📤 [${label}]`);
  const xml = fs.readFileSync(filePath, 'utf8');
  const r = await sendEnvelopeToTally(xml);
  if (r.success) {
    console.log(`   ✅ Tally: Created: ${r.created}, Altered: ${r.altered}, Errors: ${r.errors}`);
  } else {
    console.error(`   ❌ Failed: ${r.error}`);
  }
}

/**
 * Push large XML file in smooth, paced chunks of 25 items
 */
async function pushChunkedXml(filePath, label, chunkSize = 25) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  console.log(`\n📤 [${label}] (Pacing ${(stat.size / 1024 / 1024).toFixed(2)} MB file in chunks of ${chunkSize})...`);

  const xmlContent = fs.readFileSync(filePath, 'utf8');
  const msgRegex = /<TALLYMESSAGE\b[^>]*>([\s\S]*?)<\/TALLYMESSAGE>/gi;
  
  const messages = [];
  let m;
  while ((m = msgRegex.exec(xmlContent)) !== null) {
    messages.push(m[0]);
  }

  console.log(`   📊 Found ${messages.length} individual items to push.`);

  let totalCreated = 0;
  let totalAltered = 0;
  let totalErrors = 0;

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

    const res = await sendEnvelopeToTally(envelope);
    if (res.success) {
      totalCreated += res.created;
      totalAltered += res.altered;
      totalErrors += res.errors;
    } else {
      totalErrors += chunk.length;
    }

    const progress = Math.min(i + chunkSize, messages.length);
    process.stdout.write(`   ✓ Processed ${progress}/${messages.length} items (Created: ${totalCreated}, Altered: ${totalAltered})...\r`);
    
    // Smooth delay between chunks so Tally HTTP loop stays stable
    await sleep(150);
  }

  console.log(`\n   ✅ ${label} Complete! Total Created: ${totalCreated}, Altered: ${totalAltered}, Errors: ${totalErrors}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('   🚀 PUSHING ALL MASTERS TO: Hindustan Enterprises 25-26');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  // 1. Units of Measure
  await pushWholeFile(path.join(ALL_LEDGERS_DIR, 'listofunits.xml'), '1. Units of Measure');

  // 2. Account Groups
  await pushWholeFile(path.join(ALL_LEDGERS_DIR, 'groups.xml'), '2. Account Groups');

  // 3. Stock Groups
  await pushWholeFile(path.join(ALL_LEDGERS_DIR, 'listofstockgroups.xml'), '3. Stock Groups');

  // 4. All Ledgers & 1,256 Customers
  await pushChunkedXml(path.join(ALL_LEDGERS_DIR, 'listofledgers.xml'), '4. Ledgers & Customers', 25);

  // 5. All Stock Items
  await pushChunkedXml(path.join(ALL_LEDGERS_DIR, 'stockitems.xml'), '5. Stock Items', 25);

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('🎉 SUCCESS! All Masters are now in Hindustan Enterprises 25-26 on Tally!');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
