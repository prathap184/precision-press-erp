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

async function fixAndVerifyAll() {
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  const tallyData = {};

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
      // In Tally: Negative is DEBIT (Dr), Positive is CREDIT (Cr)
      balType = raw.startsWith('-') || cleanNum < 0 ? 'Dr' : 'Cr';
    }
    tallyData[name.toLowerCase()] = { name, parent, balNum, balType };
  }

  // Update Bank Accounts in paise
  const federalTally = tallyData['federal 2091'];
  const cashB2Tally = tallyData['cash b2'];
  const cashTally = tallyData['cash'];

  console.log('Tally Raw Values in Rupees:');
  console.log('Federal 2091:', federalTally);
  console.log('Cash B2:', cashB2Tally);
  console.log('Cash:', cashTally);

  // Update Bank Accounts in Supabase
  // Federal 2091: 915.00
  await supabase.from('bank_account').update({
    balance: federalTally.balType === 'Cr' ? -Math.round(federalTally.balNum * 100) : Math.round(federalTally.balNum * 100)
  }).eq('account_name', 'Federal Bank');

  // Cash B2: 74042.00 -> 7404200 paise
  await supabase.from('bank_account').update({
    balance: Math.round(cashB2Tally.balNum * 100)
  }).eq('account_name', 'Cash B2 Drawer');

  // Main Cash: 3173956.41 -> 317395641 paise
  await supabase.from('bank_account').update({
    balance: Math.round(cashTally.balNum * 100)
  }).eq('account_name', 'Main Cash Drawer');

  // Update GL Accounts in Supabase
  const { data: dbAccounts } = await supabase.from('chart_account').select('*');
  let updatedCount = 0;

  for (const acc of dbAccounts) {
    const lookup = (acc.tally_ledger_name || acc.name).toLowerCase();
    const t = tallyData[lookup] || tallyData[acc.name.toLowerCase()];
    if (t && t.balNum > 0) {
      await supabase.from('chart_account').update({
        opening_balance: String(t.balNum),
        opening_balance_type: t.balType
      }).eq('id', acc.id);
      updatedCount++;
    }
  }

  console.log(`\nUpdated ${updatedCount} GL accounts in chart_account with exact Tally balances!`);
}

fixAndVerifyAll();
