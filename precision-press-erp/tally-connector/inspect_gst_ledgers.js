const fs = require('fs');
const path = require('path');
const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const content = fs.readFileSync(xmlPath, 'utf8');

const regex = /<LEDGER\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let match;
const duties = [];

while ((match = regex.exec(content)) !== null) {
  const name = match[1];
  const body = match[2];
  const parentMatch = body.match(/<PARENT>([^<]+)<\/PARENT>/i);
  const parent = parentMatch ? parentMatch[1].trim() : '';
  const taxTypeMatch = body.match(/<TAXTYPE>([^<]+)<\/TAXTYPE>/i);
  const taxType = taxTypeMatch ? taxTypeMatch[1].trim() : '';
  const guidMatch = body.match(/<GUID>([^<]+)<\/GUID>/i);
  const guid = guidMatch ? guidMatch[1].trim() : '';
  const openBalMatch = body.match(/<OPENINGBALANCE>([^<]+)<\/OPENINGBALANCE>/i);
  const openBal = openBalMatch ? openBalMatch[1].trim() : '0';

  if (/duties/i.test(parent) || /^(cgst|sgst|igst|utgst|tds|tcs|gst)/i.test(name.trim())) {
    duties.push({ name, parent, taxType, guid, openBal });
  }
}

console.log('Duties & Taxes in Tally XML:', duties);
