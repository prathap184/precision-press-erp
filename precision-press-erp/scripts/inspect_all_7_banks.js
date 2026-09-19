const fs = require('fs');

const xml = fs.readFileSync('C:\\tally\\Master.xml', 'utf16le');
const ledgerRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
const bankAccounts = [];

while ((m = ledgerRegex.exec(xml)) !== null) {
  const name = m[1];
  const body = m[2];
  const pMatch = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = pMatch ? pMatch[1].trim() : '';
  if (parent.toLowerCase() === 'bank accounts') {
    const guid = (body.match(/<GUID>([^<]*)<\/GUID>/i) || [])[1];
    const bal = (body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i) || [])[1];
    const alter = (body.match(/<ALTERID>([^<]*)<\/ALTERID>/i) || [])[1];
    bankAccounts.push({ name, parent, guid, alter, bal });
  }
}

console.log('=== ALL LEDGERS UNDER "Bank Accounts" IN C:\\tally\\Master.xml ===');
console.log(`Total Found: ${bankAccounts.length}`);
bankAccounts.forEach((b, i) => {
  console.log(`[#${i + 1}] "${b.name}" | GUID: ${b.guid} | Alter: ${b.alter} | Bal: ${b.bal || '0'}`);
});
