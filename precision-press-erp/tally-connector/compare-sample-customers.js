const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
let xml = fs.readFileSync(file, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const testNames = [
  'Expedite Designz',
  'B2 Akbar',
  'Arihanth Marketing- Mandya- HO',
  'Ads Media- AMK- BO',
  'Acchu Mecchu ( Chamaraja Nagara )'
];

testNames.forEach(name => {
  console.log('================================================================');
  console.log('🔍 TALLY RAW XML CHECK FOR:', name);
  console.log('================================================================');
  
  const ledgerRegex = new RegExp('<LEDGER NAME="([^"]*)"[^>]*>([\\s\\S]*?)<\\/LEDGER>', 'gi');
  let match;
  let found = false;

  while ((match = ledgerRegex.exec(xml)) !== null) {
    const rawName = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    if (rawName.toLowerCase() === name.toLowerCase()) {
      found = true;
      const b = match[2];
      const guid = b.match(/<GUID>([^<]*)<\/GUID>/i)?.[1];
      const alterId = b.match(/<ALTERID>([^<]*)<\/ALTERID>/i)?.[1];
      const parent = b.match(/<PARENT>([^<]*)<\/PARENT>/i)?.[1];
      const gstin = b.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i)?.[1] || b.match(/<GSTIN>([^<]*)<\/GSTIN>/i)?.[1];
      const mobile = b.match(/<LEDGERMOBILE>([^<]*)<\/LEDGERMOBILE>/i)?.[1];
      const bal = b.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i)?.[1];
      const state = b.match(/<STATE>([^<]*)<\/STATE>/i)?.[1] || b.match(/<OLDLEDSTATENAME>([^<]*)<\/OLDLEDSTATENAME>/i)?.[1];
      const pin = b.match(/<PINCODE>([^<]*)<\/PINCODE>/i);
      
      const addresses = [];
      const addrRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
      let aM;
      while ((aM = addrRegex.exec(b)) !== null) {
        addresses.push(aM[1]);
      }

      console.log('  • Ledger Name    :', rawName);
      console.log('  • Parent Group   :', parent);
      console.log('  • Tally GUID     :', guid);
      console.log('  • AlterID        :', alterId);
      console.log('  • GSTIN / Tax No :', gstin || 'None (Unregistered)');
      console.log('  • Phone / Mobile :', mobile || 'None in tag');
      console.log('  • Address Lines  :', addresses.join(' | '));
      console.log('  • State          :', state || 'Karnataka');
      console.log('  • PIN Code       :', pin ? pin[1] : 'None');
      console.log('  • Opening Balance:', bal || '0.00');
      break;
    }
  }

  if (!found) {
    console.log('  ❌ Not found in listofledgers.xml');
  }
  console.log('\n');
});
