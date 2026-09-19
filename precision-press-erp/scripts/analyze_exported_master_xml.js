const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\tally\\Master.xml';

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

console.log('Loading C:\\tally\\Master.xml (50.8 MB)...');
const xml = fs.readFileSync(srcPath, 'utf16le');

// 1. Groups & Hierarchy
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

function classifyLedger(groupName, ledgerName) {
  const chain = getHierarchy(groupName).map(g => g.toLowerCase());
  const all = chain.join(' > ');

  if (all.includes('bank accounts') || all.includes('bank occ') || all.includes('bank od')) {
    return 'BANK';
  }
  if (all.includes('cash-in-hand') || all.includes('cash in hand') || groupName.toLowerCase() === 'cash') {
    return 'CASH';
  }
  if (all.includes('sundry creditor') || all.includes('creditors') || all.includes('supplier') || all.includes('vendor')) {
    return 'SUPPLIER';
  }
  if (all.includes('sundry debtor') || all.includes('debtors') || ['main', 'px1', 'debt', 'stf', 'brnh'].includes(groupName.toLowerCase())) {
    return 'CUSTOMER';
  }
  return 'GENERAL_LEDGER';
}

// 2. Parse all 1,912 ledgers
const ledgerRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let lm;

const banks = [];
const cash = [];
const customers = [];
const suppliers = [];
const generalLedgers = [];

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

  if (!mobile) {
    const phoneM = name.match(/\b([6-9]\d{9})\b/);
    if (phoneM) mobile = phoneM[1];
  }

  const category = classifyLedger(parent, name);
  const item = {
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

  if (category === 'BANK') banks.push(item);
  else if (category === 'CASH') cash.push(item);
  else if (category === 'CUSTOMER') customers.push(item);
  else if (category === 'SUPPLIER') suppliers.push(item);
  else generalLedgers.push(item);
}

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('       📋 FULL AUDIT OF EXPORTED C:\\tally\\Master.xml (New Web Testing)');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

console.log(`🏦 Bank Accounts            : ${banks.length}`);
console.log(`💵 Cash Accounts            : ${cash.length}`);
console.log(`👥 Customers (Debtors)      : ${customers.length}`);
console.log(`🏭 Suppliers (Creditors)    : ${suppliers.length}`);
console.log(`📊 General Ledger (GL)      : ${generalLedgers.length}`);
console.log(`─────────────────────────────────────────────────────────`);
console.log(`🎯 TOTAL LEDGERS IN FILE    : ${banks.length + cash.length + customers.length + suppliers.length + generalLedgers.length} / 1912`);

console.log('\n--- 🏦 ALL BANK ACCOUNTS IN MASTER.XML ---');
banks.forEach((b, i) => {
  console.log(`[#${i + 1}] "${b.name}" | Parent: "${b.parent}" | GUID: ${b.guid} | Bal: ₹${b.openingBalance} (${b.openingBalanceType})`);
});

console.log('\n--- 💵 CASH ACCOUNT IN MASTER.XML ---');
cash.forEach((c, i) => {
  console.log(`[#${i + 1}] "${c.name}" | Parent: "${c.parent}" | GUID: ${c.guid} | Bal: ₹${c.openingBalance} (${c.openingBalanceType})`);
});

console.log('\n--- 👥 CUSTOMER OVERVIEW (Top 5) ---');
customers.slice(0, 5).forEach((c, i) => {
  console.log(`[#${i + 1}] "${c.name}" | Group: ${c.parent} | GSTIN: ${c.gstin || 'None'} | Phone: ${c.mobile || 'None'} | GUID: ${c.guid}`);
});

console.log('\n--- 🏭 SUPPLIER OVERVIEW (Top 5) ---');
suppliers.slice(0, 5).forEach((s, i) => {
  console.log(`[#${i + 1}] "${s.name}" | Group: ${s.parent} | GSTIN: ${s.gstin || 'None'} | Phone: ${s.mobile || 'None'} | GUID: ${s.guid}`);
});
