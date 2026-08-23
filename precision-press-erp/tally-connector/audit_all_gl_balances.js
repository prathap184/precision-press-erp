const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');

function clean(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

async function auditAllGlBalances() {
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const tallyLedgers = {};
  
  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = clean(m[1]);
    const body = m[2];
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parent = parentM ? clean(parentM[1]) : '';
    
    let balNum = 0;
    let balType = 'Dr';
    if (balM) {
      const raw = clean(balM[1]);
      const cleanNum = parseFloat(raw.replace(/[^\d.-]/g, '')) || 0;
      balNum = Math.abs(cleanNum);
      balType = raw.startsWith('-') || cleanNum < 0 ? 'Dr' : 'Cr';
    }
    tallyLedgers[name.toLowerCase()] = { name, parent, balNum, balType, rawBal: balM ? balM[1] : null };
  }

  const { data: dbAccounts, error } = await supabase
    .from('chart_account')
    .select('id, code, name, type, sub_type, opening_balance, opening_balance_type, tally_ledger_name');

  if (error) {
    console.error('DB Error:', error);
    return;
  }

  console.log(`Auditing ${dbAccounts.length} Chart of Accounts against Tally XML...\n`);

  const discrepancies = [];
  const matches = [];
  const bankOrCash = [];

  for (const acc of dbAccounts) {
    const lookupKey = (acc.tally_ledger_name || acc.name).toLowerCase();
    const tallyMatch = tallyLedgers[lookupKey] || tallyLedgers[acc.name.toLowerCase()];
    
    const dbOp = Number(acc.opening_balance || 0);
    const dbType = acc.opening_balance_type || 'Dr';

    if (acc.code === '1100' || acc.code === '1000' || acc.code === '1010' || acc.type === 'asset' && acc.sub_type === 'bank') {
      bankOrCash.push({
        code: acc.code,
        name: acc.name,
        dbOp,
        dbType,
        tallyBal: tallyMatch?.balNum,
        tallyType: tallyMatch?.balType,
        tallyRaw: tallyMatch?.rawBal
      });
    }

    if (tallyMatch && tallyMatch.balNum > 0) {
      const diff = Math.abs(dbOp - tallyMatch.balNum);
      if (diff > 0.01 || dbType !== tallyMatch.balType) {
        discrepancies.push({
          id: acc.id,
          code: acc.code,
          name: acc.name,
          dbOp,
          dbType,
          tallyBal: tallyMatch.balNum,
          tallyType: tallyMatch.balType,
          diff
        });
      } else {
        matches.push(acc.name);
      }
    }
  }

  console.log('--- BANK & CASH GL ACCOUNTS IN DB ---');
  console.table(bankOrCash);

  console.log(`\nDiscrepancies found with opening balance > 0 in Tally: ${discrepancies.length}`);
  if (discrepancies.length > 0) {
    console.table(discrepancies.slice(0, 20));
  }
}

auditAllGlBalances();
