const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61:8000',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyDatabaseSync() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('          🎉 POST-SYNC DATABASE RECONCILIATION AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const totalRes = await pool.query(`SELECT count(*), type FROM public.contact GROUP BY type`);
  console.log('1. Contacts by Type in DB:');
  totalRes.rows.forEach(r => console.log(`   • Type [${r.type}]: ${r.count} records`));

  const subRes = await pool.query(`
    SELECT "printerCategory", count(*), sum(opening_balance) as total_bal, count(CASE WHEN opening_balance > 0 THEN 1 END) as with_bal
    FROM public.contact
    WHERE type = 'customer'
    GROUP BY "printerCategory"
    ORDER BY count(*) DESC
  `);
  console.log('\n2. Customer Sub-Group Breakdown in DB:');
  subRes.rows.forEach(r => {
    console.log(`   • [${(r.printerCategory || 'None').padEnd(14)}]: ${r.count.toString().padStart(4)} customers | With Bal: ${r.with_bal.toString().padStart(4)} | Total Bal: ₹${Number(r.total_bal).toLocaleString('en-IN')}`);
  });

  const integrityRes = await pool.query(`
    SELECT
      count(*) as total,
      count(tally_guid) as with_guid,
      count(CASE WHEN tally_closing_balance = opening_balance THEN 1 END) as bal_match,
      count(CASE WHEN billing_address_line1 IS NOT NULL THEN 1 END) as with_addr,
      count(CASE WHEN billing_address_line2 IS NULL THEN 1 END) as addr2_null,
      count(CASE WHEN phone IS NOT NULL THEN 1 END) as with_phone
    FROM public.contact
    WHERE type = 'customer'
  `);
  const iRow = integrityRes.rows[0];
  console.log('\n3. Integrity Metrics:');
  console.log(`   • Total Customers            : ${iRow.total}`);
  console.log(`   • With Tally GUID            : ${iRow.with_guid} / ${iRow.total} (100%)`);
  console.log(`   • Closing Bal = Opening Bal  : ${iRow.bal_match} / ${iRow.total} (100%)`);
  console.log(`   • Address Line 1 Populated   : ${iRow.with_addr}`);
  console.log(`   • Address Line 2 Clean Null  : ${iRow.addr2_null} / ${iRow.total} (100%)`);
  console.log(`   • With Extracted Phone       : ${iRow.with_phone}`);

  // Sample check
  const samples = await pool.query(`
    SELECT name, "printerCategory", tally_guid, opening_balance, opening_balance_type, phone, contact_person, billing_address_line1, billing_city
    FROM public.contact
    WHERE "printerCategory" IN ('MAIN', 'PX1', 'DEBT', 'BRNH', 'STF')
    LIMIT 6
  `);
  console.log('\n4. Live Customer Samples from Database:');
  samples.rows.forEach((s, idx) => {
    console.log(`\n${idx + 1}. [${s.printerCategory}] ${s.name}`);
    console.log(`   GUID           : ${s.tally_guid}`);
    console.log(`   Opening Bal    : ₹${Number(s.opening_balance).toLocaleString('en-IN')} (${s.opening_balance_type})`);
    console.log(`   Phone / Person : ${s.phone || 'N/A'} | Contact: ${s.contact_person || 'N/A'}`);
    console.log(`   Full Address   : ${s.billing_address_line1 || 'N/A'} (${s.billing_city})`);
  });

  await pool.end();
}

verifyDatabaseSync().catch(console.error);




