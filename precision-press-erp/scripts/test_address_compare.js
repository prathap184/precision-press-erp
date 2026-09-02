// scripts/test_address_compare.js
const fs = require('fs');
const path = require('path');

const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const xml = fs.readFileSync(xmlPath, 'utf8');

const regex = /<LEDGER NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
let count = 0;

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('       🏢 REAL TALLY 3-LINE ADDRESS ➔ ERP 1-LINE FORMATTING COMPARISON         ');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

while ((m = regex.exec(xml)) !== null && count < 3) {
  const name = m[1];
  const body = m[2];
  
  if (body.includes('<ADDRESS.LIST') && (body.match(/<ADDRESS>/gi) || []).length >= 2) {
    count++;
    console.log(`📌 EXAMPLE ${count}: [${name}]`);
    
    // Extract raw address tags
    const addrMatches = body.match(/<ADDRESS>[^<]*<\/ADDRESS>/gi) || [];
    console.log('📦 Tally Raw Multi-Line XML:');
    addrMatches.forEach((line, i) => console.log(`   Line ${i+1}: ${line.replace(/<\/?ADDRESS>/gi, '')}`));
    
    // Process through connector code
    const lines = [];
    const addrRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
    let aM;
    while ((aM = addrRegex.exec(body)) !== null) {
      const cleanLine = aM[1].trim();
      if (cleanLine) lines.push(cleanLine);
    }
    const erpSingleLine = lines.join(', ');
    console.log('✨ Saved in ERP (`billing_address_line1`):');
    console.log(`   "${erpSingleLine}"\n`);
  }
}
