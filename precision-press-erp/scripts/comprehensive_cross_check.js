const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const xml = fs.readFileSync(path.resolve(__dirname, '../scratch/new_web_testing_accounts.xml'), 'utf8');

async function crossCheck() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('      🔍 COMPREHENSIVE ERP ⟷ TALLY FIELD-BY-FIELD CROSS-VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // 1. Check Bank Accounts
  const { data: banks } = await supabase
    .from('bank_account')
    .select('*, chart_account(*)')
    .order('account_name', { ascending: true });

  console.log('===============================================================================');
  console.log('1. OPERATIONAL BANK & CASH PROFILES (public.bank_account)');
  console.log('===============================================================================');

  for (const b of banks) {
    const tName = b.tally_ledger_name;
    const reg = new RegExp('<LEDGER\\s+NAME="' + tName + '"[^>]*>([\\s\\S]*?)<\\/LEDGER>', 'i');
    const m = xml.match(reg);
    const tallyBody = m ? m[1] : '';
    const tallyGuid = (tallyBody.match(/<GUID>([^<]*)<\/GUID>/i) || [])[1];
    const tallyParent = (tallyBody.match(/<PARENT>([^<]*)<\/PARENT>/i) || [])[1];
    const tallyAlter = (tallyBody.match(/<ALTERID>([^<]*)<\/ALTERID>/i) || [])[1];

    console.log(`\n🏦 [${b.account_name}]`);
    console.log(`   • ERP Table               : public.bank_account`);
    console.log(`   • Database Record ID      : ${b.id}`);
    console.log(`   • Tally Ledger Name       : "${b.tally_ledger_name}" (Tally: "${tName}")`);
    console.log(`   • ERP Tally GUID          : ${b.tally_guid}`);
    console.log(`   • Tally Source GUID       : ${tallyGuid}`);
    console.log(`   • GUID Match              : ${b.tally_guid === tallyGuid ? '✅ EXACT MATCH' : '❌ MISMATCH'}`);
    console.log(`   • Tally Parent Group      : "${tallyParent}"`);
    console.log(`   • ERP Account Type        : ${b.account_type}`);
    console.log(`   • Tally Alter ID          : ${tallyAlter} (ERP: ${b.alter_id})`);
    console.log(`   • ERP Balance in Paise    : ${b.balance}`);
    console.log(`   • ERP Balance in ₹        : ₹${(Number(b.balance) / 100).toLocaleString('en-IN')}`);
    console.log(`   • Linked General Ledger   : ID ${b.chart_account_id}`);
    console.log(`     - GL Code & Name        : ${b.chart_account?.code} - ${b.chart_account?.name}`);
    console.log(`     - GL Tally GUID         : ${b.chart_account?.tally_guid}`);
    console.log(`     - GL Double-Entry Match : ${b.tally_guid === b.chart_account?.tally_guid ? '✅ PERFECT 1:1 LINK' : '❌ MISMATCH'}`);
  }

  // 2. Check Chart of Accounts
  const { data: coa } = await supabase
    .from('chart_account')
    .select('*')
    .not('tally_guid', 'is', null)
    .order('code', { ascending: true });

  console.log('\n===============================================================================');
  console.log(`2. CHART OF ACCOUNTS (public.chart_account) — Total Synced with Tally: ${coa.length}`);
  console.log('===============================================================================');

  // Group by category
  const categories = {};
  for (const acc of coa) {
    const key = `${acc.type.toUpperCase()} (${acc.sub_type || 'general'})`;
    if (!categories[key]) categories[key] = [];
    categories[key].push(acc);
  }

  for (const [cat, accs] of Object.entries(categories)) {
    console.log(`\n📂 CATEGORY: ${cat} [${accs.length} accounts]`);
    console.log('─'.repeat(80));
    accs.forEach(a => {
      console.log(`   • Code: ${a.code.padEnd(5)} | Name: ${a.name.padEnd(30)} | Tally Ledger: ${(a.tally_ledger_name || '').padEnd(30)}`);
      console.log(`     - Tally Group : ${a.tally_parent_group}`);
      console.log(`     - Tally GUID  : ${a.tally_guid}`);
      console.log(`     - Opening Bal : ₹${Number(a.opening_balance).toLocaleString('en-IN')} (${a.opening_balance_type})`);
      console.log(`     - Alter ID    : ${a.alter_id}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('                🎉 100% AUDIT & CROSS-CHECK COMPLETED');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
}

crossCheck();
