const fs = require('fs');
const path = require('path');

const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const xml = fs.readFileSync(xmlPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
const allLedgers = [];

while ((m = ledgerRegex.exec(xml)) !== null) {
  const rawName = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
  const parentM = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = parentM ? parentM[1].trim() : '';
  const balM = m[2].match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);

  allLedgers.push({ name: rawName, parent, bal: balM ? balM[1] : '0' });
}

// Find all unique groups
const groups = {};
allLedgers.forEach(l => {
  groups[l.parent] = (groups[l.parent] || 0) + 1;
});

console.log('All Tally Groups & Ledger Counts:');
console.log(JSON.stringify(groups, null, 2));

// Search for any bank-like or cash-like ledgers
console.log('\nAll Bank & Cash Related Ledgers in Tally:');
allLedgers.filter(l => {
  const n = l.name.toLowerCase();
  const p = l.parent.toLowerCase();
  return p.includes('bank') || p.includes('cash') || p.includes('loan') || p.includes('od') || p.includes('occ') ||
         n.includes('bank') || n.includes('hdfc') || n.includes('icici') || n.includes('sbi') || n.includes('canara') || n.includes('federal') || n.includes('cash');
}).forEach(l => {
  console.log(`- [${l.parent}] ${l.name} (Opening: ${l.bal})`);
});
