const fs = require('fs');
const xml = fs.readFileSync('C:\\tally\\Master.xml', 'utf16le');
const ledgerRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
const insideSwipe = [];
while ((m = ledgerRegex.exec(xml)) !== null) {
  const name = m[1];
  const pMatch = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = pMatch ? pMatch[1].trim() : '';
  if (parent.toLowerCase() === 'swipe charges sbi 901') {
    insideSwipe.push(name);
  }
}
console.log('Ledgers inside group "Swipe Charges SBI 901":', insideSwipe);
