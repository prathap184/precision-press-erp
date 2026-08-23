const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml'), 'utf8');
const regex = /<LEDGER NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/g;

const groups = {};
let match;
while ((match = regex.exec(xml)) !== null) {
  const name = match[1];
  const body = match[2];
  const pM = body.match(/<PARENT>(.*?)<\/PARENT>/);
  const parent = pM ? pM[1] : 'Primary';
  const oM = body.match(/<OPENINGBALANCE>(.*?)<\/OPENINGBALANCE>/);
  const opening = oM ? parseFloat(oM[1]) : 0;

  if (!groups[parent]) groups[parent] = [];
  groups[parent].push({ name, opening });
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('       📑 FULL TALLY PRIME CHART OF ACCOUNTS SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');

for (const [grp, items] of Object.entries(groups).sort((a,b) => b[1].length - a[1].length)) {
  console.log(`\n📂 [${grp}] (${items.length} Ledgers):`);
  if (items.length <= 25) {
    items.forEach(it => {
      console.log(`   • ${it.name} | Opening: ₹${Math.abs(it.opening).toLocaleString('en-IN')}`);
    });
  } else {
    items.slice(0, 10).forEach(it => {
      console.log(`   • ${it.name} | Opening: ₹${Math.abs(it.opening).toLocaleString('en-IN')}`);
    });
    console.log(`   ... and ${items.length - 10} more`);
  }
}
