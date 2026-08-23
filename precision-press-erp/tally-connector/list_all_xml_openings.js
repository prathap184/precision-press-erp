const fs = require('fs');
const path = require('path');

const XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const xml = fs.readFileSync(XML_PATH, 'utf8');

function clean(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
const list = [];
while ((m = ledgerRegex.exec(xml)) !== null) {
  const name = clean(m[1]);
  const body = m[2];
  const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
  if (balM) {
    list.push({
      name,
      parent: parentM ? clean(parentM[1]) : '',
      rawBal: balM[1].trim()
    });
  }
}

console.table(list);
