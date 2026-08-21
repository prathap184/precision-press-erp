const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
const xml = fs.readFileSync(xmlPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
let m;
const allLedgers = [];

while ((m = ledgerRegex.exec(xml)) !== null) {
  const name = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
  const parentM = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
  const parent = parentM ? parentM[1].trim() : 'Primary';
  const balM = m[2].match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);

  let bal = 0;
  let balType = 'Dr';
  if (balM) {
    const raw = balM[1].replace(/[^\d.-]/g, '');
    const num = parseFloat(raw) || 0;
    bal = Math.abs(num);
    balType = balM[1].startsWith('-') || num < 0 ? 'Cr' : 'Dr';
  }

  allLedgers.push({ name, parent, balance: bal, balanceType: balType });
}

// Categorize all ledgers into Standard Accounting Heads:
// 1. Assets (Bank, Cash, Fixed Assets, Current Assets, Loans & Advances, Debtors)
// 2. Liabilities (Sundry Creditors, Capital, Provisions, Duties & Taxes, Drawings)
// 3. Equity (Capital, Drawings)
// 4. Income (Direct Income, Indirect Income, Sales)
// 5. Expense (Direct Expense, Indirect Expense, Electricity, Maintenance)

const categories = {
  'Debtors / Customers': [],
  'Creditors / Suppliers': [],
  'Bank & Cash': [],
  'Fixed Assets & Property': [],
  'Loans & Advances (Asset)': [],
  'Capital & Drawings': [],
  'Duties & Taxes (GST/TDS)': [],
  'Expenses (Electricity, Rent, Maint)': [],
  'Incomes (Indirect/Direct)': [],
  'Provisions & Others': []
};

allLedgers.forEach(l => {
  const p = l.parent.toLowerCase();
  if (p.includes('debtor') || p.includes('customer') || p.includes('aspire') || p.includes('kinetic')) {
    categories['Debtors / Customers'].push(l);
  } else if (p.includes('creditor') || p.includes('supplier')) {
    categories['Creditors / Suppliers'].push(l);
  } else if (p.includes('bank') || p.includes('cash')) {
    categories['Bank & Cash'].push(l);
  } else if (p.includes('fixed asset') || p.includes('property')) {
    categories['Fixed Assets & Property'].push(l);
  } else if (p.includes('loan') || p.includes('advance') || p.includes('deposit')) {
    categories['Loans & Advances (Asset)'].push(l);
  } else if (p.includes('capital') || p.includes('drawing')) {
    categories['Capital & Drawings'].push(l);
  } else if (p.includes('tax') || p.includes('dutie')) {
    categories['Duties & Taxes (GST/TDS)'].push(l);
  } else if (p.includes('expense') || p.includes('maintenance') || p.includes('electricity') || p.includes('charges') || p.includes('esi') || p.includes('pf')) {
    categories['Expenses (Electricity, Rent, Maint)'].push(l);
  } else if (p.includes('income')) {
    categories['Incomes (Indirect/Direct)'].push(l);
  } else {
    categories['Provisions & Others'].push(l);
  }
});

console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log('       📊 COMPLETE TALLY PRIME CHART OF ACCOUNTS AUDIT (ALL LEDGERS)');
console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL LEDGERS IN TALLY: ${allLedgers.length}\n`);

for (const [catName, list] of Object.entries(categories)) {
  console.log(`🔹 ${catName.toUpperCase()} (${list.length} Ledgers)`);
  if (list.length <= 10) {
    list.forEach(item => {
      console.log(`   • ${item.name} [${item.parent}] — ₹${item.balance.toLocaleString('en-IN')} (${item.balanceType})`);
    });
  } else {
    list.slice(0, 4).forEach(item => {
      console.log(`   • ${item.name} [${item.parent}] — ₹${item.balance.toLocaleString('en-IN')} (${item.balanceType})`);
    });
    console.log(`   ... and ${list.length - 4} more ledgers`);
  }
  console.log('');
}
