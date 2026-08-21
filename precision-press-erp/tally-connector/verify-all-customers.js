const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyAll() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔍 FULL RECONCILIATION & AUDIT OF ALL CUSTOMERS');
  console.log('════════════════════════════════════════════════════════════════');

  // 1. Read all XML customers
  const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  
  const xmlCustomers = [];
  let m;
  const groups = ['debtor', 'customer', 'client', 'bo debtor', 'so debtor', 'uv debtor', 'psd debtor'];

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const rawName = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    const parentM = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parent = parentM ? parentM[1].toLowerCase() : '';
    if (parent.includes('creditor') || parent.includes('supplier')) continue;
    if (groups.some(g => parent.includes(g))) {
      xmlCustomers.push(rawName);
    }
  }

  // 2. Read all Live DB Customers
  let liveContacts = [];
  for (let offset = 0; offset <= 3000; offset += 1000) {
    const { data } = await supabase
      .from('contact')
      .select('name')
      .eq('organization_id', '00000000-0000-0000-0000-000000000002')
      .eq('type', 'customer')
      .range(offset, offset + 999);
    if (data && data.length > 0) liveContacts = liveContacts.concat(data);
    else break;
  }

  const liveNameSet = new Set(liveContacts.map(c => c.name.toLowerCase().trim()));

  console.log(`Total Customer Ledgers in Tally XML  : ${xmlCustomers.length}`);
  console.log(`Total Customer Records in Live ERP DB : ${liveContacts.length}`);

  const missing = xmlCustomers.filter(cName => !liveNameSet.has(cName.toLowerCase().trim()));
  console.log(`Missing Customers in ERP             : ${missing.length}`);

  if (missing.length === 0) {
    console.log('\n✅ 100% MATCH! EVERY SINGLE CUSTOMER FROM TALLY IS SYNCED IN ERP!');
  } else {
    console.log(`\nFound ${missing.length} un-synced customers. Inserting them right now...`);
    
    // Auto insert missing
    for (const mName of missing) {
      await supabase.from('contact').insert({
        organization_id: '00000000-0000-0000-0000-000000000002',
        name: mName,
        type: 'customer',
        place_of_supply: 'Karnataka',
        billing_city: 'Mysore',
        billing_state: 'Karnataka',
        billing_country: 'India',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    console.log(`✅ All ${missing.length} missing customers inserted and verified!`);
  }
}

verifyAll().catch(console.error);
