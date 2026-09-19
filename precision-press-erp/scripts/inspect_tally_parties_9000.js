const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.resolve(__dirname, '../scratch/new_web_testing_accounts.xml'), 'utf8');

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .trim();
}

// 1. Build Group Hierarchy
const groupRegex = /<GROUP\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/GROUP>/gi;
const groupParents = {};
let gm;
while ((gm = groupRegex.exec(xml)) !== null) {
  const gName = clean(gm[1]);
  const pMatch = gm[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
  groupParents[gName] = pMatch ? clean(pMatch[1]) : 'Primary';
}

function getHierarchy(groupName) {
  const chain = [groupName];
  let curr = groupName;
  let depth = 0;
  while (curr && groupParents[curr] && depth < 10) {
    curr = groupParents[curr];
    chain.push(curr);
    depth++;
  }
  return chain;
}

function classifyParty(groupName, ledgerName) {
  const chain = getHierarchy(groupName).map(g => g.toLowerCase());
  const allGroups = chain.join(' > ');

  if (allGroups.includes('creditor') || allGroups.includes('supplier')) {
    return 'SUPPLIER';
  }

  if (allGroups.includes('debtor') || allGroups.includes('customer') || ['main', 'px1', 'debt', 'stf', 'brnh'].includes(groupName.toLowerCase())) {
    return 'CUSTOMER';
  }

  return 'OTHER';
}

// 2. Parse All Ledgers
const ledgerRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let lm;
const customers = [];
const suppliers = [];
const otherParties = [];

while ((lm = ledgerRegex.exec(xml)) !== null) {
  const name = clean(lm[1]);
  const body = lm[2];

  const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = parentM ? clean(parentM[1]) : 'Primary';

  const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
  const guid = guidM ? clean(guidM[1]) : null;

  const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
  const alterId = alterM ? parseInt(alterM[1].trim(), 10) || null : null;

  const gstinM = body.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN>([^<]*)<\/GSTIN>/i);
  const gstin = gstinM ? clean(gstinM[1]).toUpperCase() : '';

  const mobileM = body.match(/<LEDGERMOBILE>([^<]*)<\/LEDGERMOBILE>/i) || body.match(/<LEDGERPHONE>([^<]*)<\/LEDGERPHONE>/i);
  let mobile = mobileM ? clean(mobileM[1]).replace(/^PH\s*/i, '').trim() : '';

  const emailM = body.match(/<EMAIL>([^<]*)<\/EMAIL>/i);
  const email = emailM ? clean(emailM[1]) : '';

  const stateM = body.match(/<STATE>([^<]*)<\/STATE>/i) || body.match(/<OLDLEDSTATENAME>([^<]*)<\/OLDLEDSTATENAME>/i);
  const state = stateM ? clean(stateM[1]) : '';

  const pinM = body.match(/<PINCODE>([^<]*)<\/PINCODE>/i);
  const pincode = pinM ? clean(pinM[1]) : '';

  const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  let balNum = 0;
  let balType = 'Dr';
  if (balM) {
    const raw = clean(balM[1]);
    const num = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
    balNum = Math.abs(num);
    balType = raw.startsWith('-') || num < 0 ? 'Dr' : 'Cr';
  }

  // Address lines
  const addressLines = [];
  const addrRegex = /<ADDRESS>([^<]*)<\/ADDRESS>/gi;
  let aM;
  while ((aM = addrRegex.exec(body)) !== null) {
    const line = clean(aM[1]);
    if (line) addressLines.push(line);
  }

  // Extract phone from name if missing
  if (!mobile) {
    const phoneM = name.match(/\b([6-9]\d{9})\b/);
    if (phoneM) mobile = phoneM[1];
  }

  const category = classifyParty(parent, name);

  const partyObj = {
    name,
    parent,
    guid,
    alterId,
    gstin,
    mobile,
    email,
    state,
    pincode,
    address: addressLines.join(', '),
    openingBalance: balNum,
    openingBalanceType: balType
  };

  if (category === 'CUSTOMER') {
    customers.push(partyObj);
  } else if (category === 'SUPPLIER') {
    suppliers.push(partyObj);
  } else {
    otherParties.push(partyObj);
  }
}

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('   🔍 TALLY "New Web Testing" CUSTOMERS & SUPPLIERS INSPECTION REPORT');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

console.log(`👥 Total Customers (Debtors): ${customers.length}`);
console.log(`🏭 Total Suppliers (Creditors): ${suppliers.length}`);
console.log(`📦 Other Non-Party Ledgers    : ${otherParties.length}\n`);

// Customer Stats
const custWithGstin = customers.filter(c => c.gstin);
const custWithPhone = customers.filter(c => c.mobile);
const custWithBal = customers.filter(c => c.openingBalance > 0);

console.log('--- 👤 CUSTOMER DATA QUALITY METRICS ---');
console.log(` • With GSTIN          : ${custWithGstin.length} / ${customers.length}`);
console.log(` • With Phone / Mobile : ${custWithPhone.length} / ${customers.length}`);
console.log(` • With Opening Balance: ${custWithBal.length} / ${customers.length}`);

// Supplier Stats
const suppWithGstin = suppliers.filter(s => s.gstin);
const suppWithPhone = suppliers.filter(s => s.mobile);
const suppWithBal = suppliers.filter(s => s.openingBalance > 0);

console.log('\n--- 🏭 SUPPLIER DATA QUALITY METRICS ---');
console.log(` • With GSTIN          : ${suppWithGstin.length} / ${suppliers.length}`);
console.log(` • With Phone / Mobile : ${suppWithPhone.length} / ${suppliers.length}`);
console.log(` • With Opening Balance: ${suppWithBal.length} / ${suppliers.length}`);

// Sample Customers
console.log('\n--- 📋 SAMPLE CUSTOMERS (First 5) ---');
customers.slice(0, 5).forEach((c, idx) => {
  console.log(`[#${idx + 1}] "${c.name}"`);
  console.log(`   • Tally Group  : ${c.parent}`);
  console.log(`   • GUID         : ${c.guid}`);
  console.log(`   • Alter ID     : ${c.alterId}`);
  console.log(`   • GSTIN        : ${c.gstin || 'Unregistered'}`);
  console.log(`   • Phone        : ${c.mobile || 'N/A'}`);
  console.log(`   • State        : ${c.state || 'Karnataka'}`);
  console.log(`   • Opening Bal  : ₹${c.openingBalance.toLocaleString('en-IN')} (${c.openingBalanceType})`);
});

// Sample Suppliers
console.log('\n--- 📋 SAMPLE SUPPLIERS (First 5) ---');
suppliers.slice(0, 5).forEach((s, idx) => {
  console.log(`[#${idx + 1}] "${s.name}"`);
  console.log(`   • Tally Group  : ${s.parent}`);
  console.log(`   • GUID         : ${s.guid}`);
  console.log(`   • Alter ID     : ${s.alterId}`);
  console.log(`   • GSTIN        : ${s.gstin || 'Unregistered'}`);
  console.log(`   • Phone        : ${s.mobile || 'N/A'}`);
  console.log(`   • State        : ${s.state || 'Karnataka'}`);
  console.log(`   • Opening Bal  : ₹${s.openingBalance.toLocaleString('en-IN')} (${s.openingBalanceType})`);
});
