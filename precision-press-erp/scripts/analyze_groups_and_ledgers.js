const fs = require('fs');
const path = require('path');

const xml = fs.readFileSync(path.resolve(__dirname, '../scratch/new_web_testing_accounts.xml'), 'utf8');

// 1. Extract all Groups and their parent chain
const groupRegex = /<GROUP\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/GROUP>/gi;
const groupParents = {};
let gm;
while ((gm = groupRegex.exec(xml)) !== null) {
  const gName = gm[1].trim();
  const pMatch = gm[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
  groupParents[gName] = pMatch ? pMatch[1].trim() : 'Primary';
}

function getRootGroup(groupName) {
  let curr = groupName;
  let depth = 0;
  while (curr && groupParents[curr] && depth < 10) {
    curr = groupParents[curr];
    depth++;
  }
  return curr || groupName;
}

function isSundryDebtorOrCreditor(groupName) {
  let curr = groupName;
  let depth = 0;
  while (curr && depth < 10) {
    const lower = curr.toLowerCase();
    if (lower.includes('sundry debtor') || lower.includes('sundry creditor')) return true;
    curr = groupParents[curr];
    depth++;
  }
  return false;
}

// 2. Classify all ledgers
const ledgerRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let lm;
const banks = [];
const cash = [];
const coa = [];
const parties = [];

while ((lm = ledgerRegex.exec(xml)) !== null) {
  const name = lm[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
  const body = lm[2];
  const pMatch = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = pMatch ? pMatch[1].replace(/&amp;/g, '&').trim() : 'Primary';
  const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
  const guid = guidM ? guidM[1].trim() : '';
  const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
  let balNum = 0;
  let balType = 'Dr';
  if (balM) {
    const raw = balM[1].trim();
    const num = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
    balNum = Math.abs(num);
    balType = raw.startsWith('-') || num < 0 ? 'Dr' : 'Cr';
  }

  const pLower = parent.toLowerCase();
  if (pLower.includes('bank account') || pLower.includes('bank occ') || pLower.includes('bank od')) {
    banks.push({ name, parent, guid, balance: balNum, balanceType: balType });
  } else if (pLower.includes('cash-in-hand') || pLower.includes('cash in hand') || pLower === 'cash') {
    cash.push({ name, parent, guid, balance: balNum, balanceType: balType });
  } else if (isSundryDebtorOrCreditor(parent)) {
    parties.push({ name, parent, guid, balance: balNum, balanceType: balType, root: getRootGroup(parent) });
  } else {
    coa.push({ name, parent, guid, balance: balNum, balanceType: balType, root: getRootGroup(parent) });
  }
}

console.log('--- REFINED ANALYSIS FOR NEW WEB TESTING ---');
console.log(`🏦 Banks: ${banks.length}`);
console.log(`💵 Cash: ${cash.length}`);
console.log(`📊 True Chart of Accounts (GL): ${coa.length}`);
console.log(`👥 Customers & Suppliers (Parties): ${parties.length}`);

console.log('\n--- TRUE GENERAL LEDGERS ---');
coa.forEach((c, i) => {
  console.log(`[${i + 1}] "${c.name}" | Parent: "${c.parent}" (Root: "${c.root}") | GUID: ${c.guid} | Bal: ₹${c.balance} (${c.balanceType})`);
});
