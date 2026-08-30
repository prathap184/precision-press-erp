// scripts/fix_payment_je.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function fix() {
  const sql = postgres(process.env.DATABASE_URL);
  
  // Set journal_entry_id for ADV-0001 to 17de4a22-d16e-4456-9074-287e25e5a5e5
  await sql`
    UPDATE payment 
    SET journal_entry_id = '17de4a22-d16e-4456-9074-287e25e5a5e5' 
    WHERE payment_number = 'ADV-0001' OR reference = 'ADV-0001';
  `;

  console.log('✅ Updated payment rows for ADV-0001 to point directly to master Journal Entry 17de4a22-d16e-4456-9074-287e25e5a5e5');
  await sql.end();
}

fix().catch(console.error);
