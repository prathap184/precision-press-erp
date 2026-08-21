const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
let xml = fs.readFileSync(file, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const SUPPLIER_GROUPS = [
  'creditor',
  'sundry creditor',
  'supplier',
  'vendor',
  'raw material'
];

function isSupplierGroup(group) {
  if (!group) return false;
  const lower = group.toLowerCase();
  if (lower.includes('debtor') || lower.includes('customer')) return false;
  return SUPPLIER_GROUPS.some(k => lower.includes(k));
}

function clean(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
const suppliers = [];
let match;

while ((match = ledgerRegex.exec(xml)) !== null) {
  const name = clean(match[1]);
  const body = match[2];

  const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = parentM ? clean(parentM[1]) : '';
  if (!isSupplierGroup(parent)) continue;

  const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
  const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
  const gstinM = body.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN>([^<]*)<\/GSTIN>/i);
  const mobileM = body.match(/<LEDGERMOBILE>([^<]*)<\/LEDGERMOBILE>/i);
  const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  const stateM = body.match(/<STATE>([^<]*)<\/STATE>/i) || body.match(/<OLDLEDSTATENAME>([^<]*)<\/OLDLEDSTATENAME>/i);
  const pinM = body.match(/<PINCODE>([^<]*)<\/PINCODE>/i);

  const addressLines = [];
  const addrRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
  let aM;
  while ((aM = addrRegex.exec(body)) !== null) {
    const line = clean(aM[1]);
    if (line) addressLines.push(line);
  }

  let balNum = 0;
  let balType = 'Cr';
  if (balM) {
    const raw = clean(balM[1]);
    const cleanNum = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
    balNum = Math.abs(cleanNum);
    balType = raw.startsWith('-') || cleanNum < 0 ? 'Dr' : 'Cr';
  }

  suppliers.push({
    name,
    parentGroup: parent,
    guid: guidM ? clean(guidM[1]) : null,
    alterId: alterM ? parseInt(alterM[1].trim(), 10) || null : null,
    gstin: gstinM ? clean(gstinM[1]).toUpperCase() : null,
    mobile: mobileM ? clean(mobileM[1]) : null,
    state: stateM ? clean(stateM[1]) : 'Karnataka',
    pincode: pinM ? clean(pinM[1]) : null,
    fullAddress: addressLines.join(', '),
    openingBalance: balNum,
    openingBalanceType: balType
  });
}

console.log('════════════════════════════════════════════════════════════════');
console.log('🔍 TALLY RAW MATERIAL SUPPLIERS / SUNDRY CREDITORS AUDIT');
console.log('════════════════════════════════════════════════════════════════');
console.log(`Total Suppliers Found in Tally: ${suppliers.length}\n`);

console.log('--- SAMPLE OF TOP SUPPLIERS ---');
suppliers.slice(0, 8).forEach((s, idx) => {
  console.log(`[Supplier #${idx + 1}] ${s.name}`);
  console.log(`  • Group   : ${s.parentGroup}`);
  console.log(`  • GSTIN   : ${s.gstin || 'Unregistered'}`);
  console.log(`  • State   : ${s.state} (PIN: ${s.pincode || 'N/A'})`);
  console.log(`  • Address : ${s.fullAddress || 'N/A'}`);
  console.log(`  • Balance : ₹${s.openingBalance.toLocaleString('en-IN')} (${s.openingBalanceType})\n`);
});
