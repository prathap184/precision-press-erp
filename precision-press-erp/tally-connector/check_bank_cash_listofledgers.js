const fs = require('fs');
const path = require('path');
const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml'), 'utf8');

const targetLedgers = [
  'Federal Bank',
  'Cash',
  'Cash in Hand',
  'Cash (B2)',
  'Main Cash'
];

console.log('=== SEARCHING TALLY listofledgers.xml FOR BANK & CASH LEDGERS ===');
const regex = /<LEDGER\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
while ((m = regex.exec(xml)) !== null) {
  const name = m[1];
  const body = m[2];
  const parent = (body.match(/<PARENT>([^<]*)<\/PARENT>/i) || [])[1] || '';
  
  const isTarget = targetLedgers.some(t => name.toLowerCase().includes(t.toLowerCase()) || parent.toLowerCase().includes('bank') || parent.toLowerCase().includes('cash'));
  
  if (isTarget) {
    const openBal = (body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i) || [])[1] || '0 (No tag)';
    const guid = (body.match(/<GUID>([^<]*)<\/GUID>/i) || [])[1] || '';
    console.log(`\n🏦 Ledger: "${name}" (Parent: "${parent}")`);
    console.log(`   • Tally <OPENINGBALANCE>: ${openBal}`);
    console.log(`   • GUID: ${guid}`);
  }
}
