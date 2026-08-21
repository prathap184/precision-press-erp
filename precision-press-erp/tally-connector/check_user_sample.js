const fs = require('fs');
const path = require('path');

const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const xml = fs.readFileSync(xmlPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const targetNames = ['Fire Cools - Cr', 'Cornerstone Service- Mys', 'C. Naveen Kumar'];

targetNames.forEach(target => {
  const reg = new RegExp(`<LEDGER NAME="${target.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}"[^>]*>([\\s\\S]*?)<\\/LEDGER>`, 'i');
  const m = xml.match(reg);
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`🔍 RAW TALLY XML FOR: "${target}"`);
  console.log('════════════════════════════════════════════════════════════════');
  if (m) {
    console.log(m[0].trim());
  } else {
    console.log('NOT FOUND in XML!');
  }
  console.log('\n');
});
