const { Client } = require('pg');
const newDbUrl = 'postgresql://postgres.eeqqiylszgrbkfcdrftv:Powerstar%40200319@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';

const tablesToClear = [
  'transactions',
  'hsn_master',
  'company_full_details',
  'company_bank_ledger',
  'bank_amount_ledger',
  'hand_cash_ledger',
  'suppliers'
];

async function run() {
  const client = new Client({ connectionString: newDbUrl });
  await client.connect();
  
  for (const table of tablesToClear) {
    try {
      await client.query(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`✅ Cleared table: ${table}`);
    } catch (e) {
      console.error(`❌ Failed to clear ${table}:`, e.message);
    }
  }
  
  await client.end();
}
run();
