const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml'), 'utf8');
const regex = /<LEDGER NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/g;

const contactGroups = [
  'Sundry Debtors', 'Debtors HO', 'Debtors Warehouse BO', 'Debtors Print PO', 'Debtors Fiber Laser SO',
  'Debtors Glass GO', 'Debtors Aspire', 'Debtors Kinetic', 'Debtors Sublimation TO', 'Debtor Glass',
  'BO Debtor Main Big', 'BO Debtor CSH', 'BO Debtor Collection', 'BO Debtor ASMD', 'BO Debtor Viz',
  'BO Debtor Aludecor', 'BO Debtor Tuflite', 'BO Debtor BTR', 'SO Debtor- Vimal', 'SO Debtor Collection',
  'SO Debtor- Branch', 'SO Debtor- Till May2023', 'UV Debtor- UVPRO', 'Debtor Same', 'Medical Debtors',
  'PSD Debtor', 'Cyient DLM', 'Sundry Creditors', 'Sundry Creditor IRWIN', 'Sundy Creditors- HO',
  'Sundry Creditors Advance', 'Glass Creditor', 'Aludecor Sundar', 'Del'
];

const nonContacts = [];
let match;
while ((match = regex.exec(xml)) !== null) {
  const name = match[1];
  const body = match[2];
  const pM = body.match(/<PARENT>(.*?)<\/PARENT>/);
  const parent = pM ? pM[1] : 'Primary';
  const oM = body.match(/<OPENINGBALANCE>(.*?)<\/OPENINGBALANCE>/);
  const opening = oM ? parseFloat(oM[1]) : 0;

  if (!contactGroups.includes(parent)) {
    nonContacts.push({ name, parent, opening });
  }
}

console.log('═══════════════════════════════════════════════════════════════════');
console.log(`TOTAL REMAINING TALLY LEDGERS (NON-CONTACTS): ${nonContacts.length}`);
console.log('═══════════════════════════════════════════════════════════════════\n');

nonContacts.sort((a,b) => a.parent.localeCompare(b.parent) || a.name.localeCompare(b.name));

const byParent = {};
nonContacts.forEach(item => {
  if (!byParent[item.parent]) byParent[item.parent] = [];
  byParent[item.parent].push(item);
});

for (const [parent, items] of Object.entries(byParent)) {
  console.log(`\n📂 [${parent}] (${items.length} Ledgers):`);
  items.forEach(it => {
    const balType = it.opening < 0 ? 'Dr' : it.opening > 0 ? 'Cr' : '-';
    console.log(`   • ${it.name.padEnd(50)} | ₹${Math.abs(it.opening).toLocaleString('en-IN').padStart(12)} (${balType})`);
  });
}
