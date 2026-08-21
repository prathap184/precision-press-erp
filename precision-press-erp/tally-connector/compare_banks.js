const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function compareBanks() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('🔍 1. TALLY BANK & CASH LEDGERS (From Office Tally XML)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');

  const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  const tallyBanks = [];
  const bankGroups = ['bank accounts', 'bank occ a/c', 'bank od a/c', 'cash-in-hand', 'cash'];

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const rawName = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    const parentM = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parent = parentM ? parentM[1].toLowerCase().trim() : '';

    if (bankGroups.some(g => parent === g || parent.includes('bank') || parent.includes('cash'))) {
      const guidM = m[2].match(/<GUID>([^<]*)<\/GUID>/i);
      const balM = m[2].match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
      const accNoM = m[2].match(/<BANKACCOUNTNUMBER>([^<]*)<\/BANKACCOUNTNUMBER>/i) || m[2].match(/<ACCOUNTNUMBER>([^<]*)<\/ACCOUNTNUMBER>/i);
      const ifscM = m[2].match(/<IFSCODE>([^<]*)<\/IFSCODE>/i);

      let bal = 0;
      let balType = 'Dr';
      if (balM) {
        const raw = balM[1].replace(/[^\d.-]/g, '');
        const num = parseFloat(raw) || 0;
        bal = Math.abs(num);
        balType = balM[1].startsWith('-') || num < 0 ? 'Cr' : 'Dr';
      }

      tallyBanks.push({
        name: rawName,
        group: parentM ? parentM[1].trim() : '',
        guid: guidM ? guidM[1] : null,
        accountNo: accNoM ? accNoM[1].trim() : null,
        ifsc: ifscM ? ifscM[1].trim() : null,
        balance: bal,
        balanceType: balType
      });
    }
  }

  console.log(`Found ${tallyBanks.length} Bank & Cash Ledgers in Tally:\n`);
  tallyBanks.forEach((b, idx) => {
    console.log(`[Tally Bank/Cash #${idx + 1}] ${b.name}`);
    console.log(`  • Group       : ${b.group}`);
    console.log(`  • Account No  : ${b.accountNo || 'N/A'}`);
    console.log(`  • IFSC Code   : ${b.ifsc || 'N/A'}`);
    console.log(`  • Opening Bal : ₹${b.balance.toLocaleString('en-IN')} (${b.balanceType})\n`);
  });

  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('🔍 2. ERP LIVE BANK ACCOUNTS & LINKED CHART OF ACCOUNTS');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');

  const { data: erpBankAccs } = await supabase
    .from('bank_account')
    .select('id, account_name, account_number, bank_name, currency_code, chart_account_id, current_balance, opening_balance');

  const { data: allChartAccs } = await supabase
    .from('chart_account')
    .select('id, code, name, type, sub_type, is_active')
    .order('code', { ascending: true });

  const chartMap = new Map();
  allChartAccs?.forEach(c => chartMap.set(c.id, c));

  console.log(`Found ${erpBankAccs?.length || 0} Bank Accounts in ERP 'bank_account' table:\n`);
  erpBankAccs?.forEach((b, idx) => {
    const linkedGl = chartMap.get(b.chart_account_id);
    console.log(`[ERP Bank Account #${idx + 1}] ${b.account_name}`);
    console.log(`  • Bank Name     : ${b.bank_name || 'N/A'}`);
    console.log(`  • Account Number: ${b.account_number || 'N/A'}`);
    console.log(`  • Currency      : ${b.currency_code}`);
    console.log(`  • Opening Bal   : ₹${b.opening_balance || 0}`);
    console.log(`  • Linked GL (CoA): Code ${linkedGl?.code || 'UNLINKED'} - ${linkedGl?.name || 'No Linked GL'} (${linkedGl?.type} / ${linkedGl?.sub_type})\n`);
  });

  console.log('--- RELEVANT CHART OF ACCOUNTS (ASSETS / BANK & CASH) ---');
  const bankChartAccounts = allChartAccs?.filter(c => 
    c.type === 'asset' && (c.sub_type === 'bank' || c.sub_type === 'cash' || c.name.toLowerCase().includes('bank') || c.name.toLowerCase().includes('cash'))
  );
  bankChartAccounts?.forEach(c => {
    console.log(`  • Code ${c.code}: ${c.name} (${c.type} / ${c.sub_type}) - ID: ${c.id}`);
  });
}

compareBanks().catch(console.error);
