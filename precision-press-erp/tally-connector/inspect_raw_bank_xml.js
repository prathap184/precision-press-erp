const fs = require('fs');
const path = require('path');

const XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const xml = fs.readFileSync(XML_PATH, 'utf8');

function findLedger(name) {
  const reg = new RegExp(`<LEDGER NAME="${name}"[\\s\\S]*?<\\/LEDGER>`, 'i');
  const m = xml.match(reg);
  console.log(`=== RAW XML FOR ${name} ===`);
  console.log(m ? m[0] : 'NOT FOUND');
}

findLedger('Federal 2091');
findLedger('Cash B2');
findLedger('Cash');
