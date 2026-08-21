const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../tally_sync/all ledgers/Sales_HS7547.xml');
let xml = fs.readFileSync(file, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const voucherRegex = /<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
const match = voucherRegex.exec(xml);

if (match) {
  const v = match[0];
  console.log('=== VOUCHER XML TAGS ===');
  
  // Show Party & Ledger Entries
  const partyMatch = v.match(/<PARTYLEDGERNAME>([^<]*)<\/PARTYLEDGERNAME>/i);
  const vchNum = v.match(/<VOUCHERNUMBER>([^<]*)<\/VOUCHERNUMBER>/i);
  const date = v.match(/<DATE>([^<]*)<\/DATE>/i);
  
  console.log('VOUCHER NUMBER:', vchNum?.[1]);
  console.log('DATE:', date?.[1]);
  console.log('PARTY:', partyMatch?.[1]);
  
  // Find all Ledger Entries & Inventory Entries
  const allLedgers = [...v.matchAll(/<(?:ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST>([\s\S]*?)<\/(?:ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST>/gi)];
  console.log('\n--- ACCOUNTING LEDGER SPLIT ---');
  allLedgers.forEach(l => {
    const name = l[1].match(/<LEDGERNAME>([^<]*)<\/LEDGERNAME>/i)?.[1];
    const amt = l[1].match(/<AMOUNT>([^<]*)<\/AMOUNT>/i)?.[1];
    const isPos = l[1].match(/<ISDEEMEDPOSITIVE>([^<]*)<\/ISDEEMEDPOSITIVE>/i)?.[1];
    console.log(`Ledger: ${name} | Amount: ${amt} | IsDeemedPositive: ${isPos}`);
  });
}
