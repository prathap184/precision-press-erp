const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const xml = fs.readFileSync('C:\\tally\\Master.xml', 'utf16le');

async function auditCoa() {
  const { data: erpAccounts } = await supabase
    .from('chart_account')
    .select('*')
    .order('code', { ascending: true });

  console.log(`Total Chart of Accounts in ERP: ${erpAccounts.length}`);

  const withTallyGuid = erpAccounts.filter(a => a.tally_guid);
  const baseSystem = erpAccounts.filter(a => !a.tally_guid);

  console.log(` • Synced from Tally (with Tally GUID): ${withTallyGuid.length}`);
  console.log(` • Standard ERP Base System Accounts : ${baseSystem.length}\n`);

  // Verify each synced account exists in Master.xml
  let verifiedMatches = 0;
  let missingInXml = 0;

  for (const acc of withTallyGuid) {
    const guidReg = new RegExp('<GUID>' + acc.tally_guid + '<\\/GUID>', 'i');
    if (guidReg.test(xml)) {
      verifiedMatches++;
    } else {
      missingInXml++;
      console.log(`⚠️ GUID not found in Master.xml: ${acc.code} ${acc.name} (${acc.tally_guid})`);
    }
  }

  console.log(`🎯 GUID Integrity: ${verifiedMatches} / ${withTallyGuid.length} perfectly found in Tally Master.xml!`);

  // Breakdown by Accounting Type
  const typeMap = {};
  erpAccounts.forEach(a => {
    const t = a.type.toUpperCase();
    typeMap[t] = (typeMap[t] || 0) + 1;
  });

  console.log('\n--- 📊 ERP CHART OF ACCOUNTS SUMMARY BY TYPE ---');
  for (const [t, count] of Object.entries(typeMap)) {
    console.log(` • ${t.padEnd(12)}: ${count} accounts`);
  }
}

auditCoa();
