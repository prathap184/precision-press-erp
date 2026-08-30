const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tally_sync', 'all ledgers');

function extractTags(xml, tagName) {
  const regex = new RegExp(`<${tagName}\\s+NAME="([^"]+)"`, 'gi');
  const results = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function parseLedgers(xml) {
  const ledgerRegex = /<LEDGER\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  const list = [];
  let m;
  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = m[1];
    const content = m[2];
    const parentMatch = content.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parent = parentMatch ? parentMatch[1] : '';
    list.push({ name, parent });
  }
  return list;
}

// 1. Stock Categories
let categories = [];
const catFile = path.join(dir, 'listofstockcategories.xml');
if (fs.existsSync(catFile)) {
  categories = extractTags(fs.readFileSync(catFile, 'utf8'), 'STOCKCATEGORY');
}

// 2. Stock Groups
let stockGroups = [];
const sgFile = path.join(dir, 'listofstockgroups.xml');
if (fs.existsSync(sgFile)) {
  stockGroups = extractTags(fs.readFileSync(sgFile, 'utf8'), 'STOCKGROUP');
}

// 3. Account Groups
let accountGroups = [];
const agFile = path.join(dir, 'groups.xml');
if (fs.existsSync(agFile)) {
  accountGroups = extractTags(fs.readFileSync(agFile, 'utf8'), 'GROUP');
}

// 4. All Ledgers by Parent
let ledgers = [];
const lFile = path.join(dir, 'listofledgers.xml');
if (fs.existsSync(lFile)) {
  ledgers = parseLedgers(fs.readFileSync(lFile, 'utf8'));
}

// Group ledgers by parent
const ledgersByParent = {};
ledgers.forEach(l => {
  const p = l.parent || 'No Parent';
  if (!ledgersByParent[p]) ledgersByParent[p] = [];
  ledgersByParent[p].push(l.name);
});

console.log('=== STOCK CATEGORIES (' + categories.length + ') ===');
console.log(JSON.stringify(categories, null, 2));

console.log('\n=== STOCK GROUPS (' + stockGroups.length + ') ===');
console.log(JSON.stringify(stockGroups, null, 2));

console.log('\n=== ACCOUNT GROUPS (' + accountGroups.length + ') ===');
console.log(JSON.stringify(accountGroups, null, 2));

console.log('\n=== LEDGERS BY ACCOUNT GROUP ===');
Object.keys(ledgersByParent).forEach(group => {
  console.log(`\n📂 [${group}] (${ledgersByParent[group].length} ledgers):`);
  console.log(ledgersByParent[group].slice(0, 10).join(', ') + (ledgersByParent[group].length > 10 ? ` ... +${ledgersByParent[group].length - 10} more` : ''));
});
