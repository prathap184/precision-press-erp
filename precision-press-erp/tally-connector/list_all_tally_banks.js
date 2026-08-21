const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../tally_sync/all ledgers');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));

const allBankCashLedgers = new Map();

files.forEach(f => {
  const fullPath = path.join(dir, f);
  try {
    const xml = fs.readFileSync(fullPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
    let m;
    while ((m = ledgerRegex.exec(xml)) !== null) {
      const name = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
      const parentM = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
      const parent = parentM ? parentM[1].trim() : '';
      const balM = m[2].match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
      const accNoM = m[2].match(/<BANKACCOUNTNUMBER>([^<]*)<\/BANKACCOUNTNUMBER>/i) || m[2].match(/<ACCOUNTNUMBER>([^<]*)<\/ACCOUNTNUMBER>/i);
      const ifscM = m[2].match(/<IFSCODE>([^<]*)<\/IFSCODE>/i);

      const pLower = parent.toLowerCase();
      if (pLower.includes('bank') || pLower.includes('cash') || pLower.includes('od') || pLower.includes('occ')) {
        let bal = 0;
        let balType = 'Dr';
        if (balM) {
          const raw = balM[1].replace(/[^\d.-]/g, '');
          const num = parseFloat(raw) || 0;
          bal = Math.abs(num);
          balType = balM[1].startsWith('-') || num < 0 ? 'Cr' : 'Dr';
        }

        if (!allBankCashLedgers.has(name)) {
          allBankCashLedgers.set(name, {
            name,
            group: parent,
            accountNo: accNoM ? accNoM[1].trim() : null,
            ifsc: ifscM ? ifscM[1].trim() : null,
            balance: bal,
            balanceType: balType,
            foundIn: f
          });
        }
      }
    }
  } catch (err) {}
});

console.log('════════════════════════════════════════════════════════════════');
console.log('🔍 ALL BANK & CASH LEDGERS ACROSS ALL TALLY MASTERS');
console.log('════════════════════════════════════════════════════════════════');
console.log(`Total Found: ${allBankCashLedgers.size}\n`);

let idx = 1;
for (const [name, b] of allBankCashLedgers) {
  console.log(`[#${idx++}] ${b.name}`);
  console.log(`  • Group       : ${b.group}`);
  console.log(`  • Account No  : ${b.accountNo || 'N/A'}`);
  console.log(`  • IFSC Code   : ${b.ifsc || 'N/A'}`);
  console.log(`  • Opening Bal : ₹${b.balance.toLocaleString('en-IN')} (${b.balanceType})`);
  console.log(`  • XML File    : ${b.foundIn}\n`);
}
