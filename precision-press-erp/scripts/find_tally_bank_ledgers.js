// scripts/find_tally_bank_ledgers.js
const fs = require('fs');
const xml = fs.readFileSync('tally_sync/all ledgers/listofallreceiptregisters.xml', 'utf8');

const matches = xml.match(/<LEDGERNAME>(.*?)<\/LEDGERNAME>/g) || [];
const counts = {};
for (const m of matches) {
  const name = m.replace(/<\/?LEDGERNAME>/g, '');
  counts[name] = (counts[name] || 0) + 1;
}

console.log('=== LEDGERS IN LISTOFALLRECEIPTREGISTERS.XML ===');
const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
sorted.slice(0, 30).forEach(([k, v]) => console.log(`${k}: ${v} times`));
