const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml'), 'utf8');

const targetNames = [
  'CP 22 Medium Grey',
  'CP 48 Haier Grey',
  'CP 141 DeepBrown',
  'CP 219 Shiffing Blue',
  'CP 37 Light Green',
  'CP 43 Cream White'
];

targetNames.forEach(name => {
  const re = new RegExp('<STOCKITEM\\s+NAME="' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>([\\s\\S]*?)<\\/STOCKITEM>', 'i');
  const m = xml.match(re);
  if (m) {
    const body = m[1];
    const openBal = (body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i) || [])[1] || '0 (No tag)';
    const openRate = (body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i) || [])[1] || '0 (No tag)';
    const openVal = (body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i) || [])[1] || '0 (No tag)';
    console.log(`\n📦 Product: "${name}"`);
    console.log(`   • Tally <OPENINGBALANCE>: ${openBal}`);
    console.log(`   • Tally <OPENINGRATE>:    ${openRate}`);
    console.log(`   • Tally <OPENINGVALUE>:   ${openVal}`);
  } else {
    console.log(`❌ Not found: "${name}"`);
  }
});
