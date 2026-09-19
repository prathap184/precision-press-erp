const fs = require('fs');
const xml = fs.readFileSync('C:\\tally\\Master.xml', 'utf16le');
const ledgerRegex = /<LEDGER\s+NAME="([^"]*Swipe[^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
while ((m = ledgerRegex.exec(xml)) !== null) {
  const name = m[1];
  const pMatch = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
  const guid = (m[2].match(/<GUID>([^<]*)<\/GUID>/i) || [])[1];
  console.log('Swipe ledger:', name, '| Parent:', pMatch ? pMatch[1] : 'None', '| GUID:', guid);
}
