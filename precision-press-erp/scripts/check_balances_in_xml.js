const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.resolve(__dirname, '../scratch/new_web_testing_accounts.xml'), 'utf8');
const targets = ['Cash', 'EVIZ', 'ICICI 4349', 'Federal Bank 2091'];

for (const t of targets) {
  const reg = new RegExp('<LEDGER\\s+NAME="' + t + '"[^>]*>([\\s\\S]*?)<\\/LEDGER>', 'i');
  const m = xml.match(reg);
  if (m) {
    const body = m[1];
    const ob = (body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i) || [])[1];
    const cb = (body.match(/<CLOSINGBALANCE>([^<]*)<\/CLOSINGBALANCE>/i) || [])[1];
    console.log(`=== ${t} ===`);
    console.log(`  • OPENINGBALANCE tag : ${ob}`);
    console.log(`  • CLOSINGBALANCE tag : ${cb}`);

    // Check if there are other balance tags
    const allBalTags = body.match(/<[^>]*BAL[^>]*>[^<]*<\/[^>]*>/gi) || [];
    console.log(`  • All balance-related tags:`, allBalTags);
  }
}
