// scripts/check_pg_direct.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
});

async function run() {
  console.log('=== SEARCHING FOR REC-00036 IN POSTGRESQL DATABASE ===');
  
  // Search payment
  const resPay = await pool.query(`SELECT * FROM payment WHERE payment_number ILIKE '%36%' OR reference ILIKE '%36%' OR notes ILIKE '%36%'`);
  console.log('Payment matches:', resPay.rows);

  // Search journal_entry
  const resJE = await pool.query(`SELECT * FROM journal_entry WHERE reference_number ILIKE '%36%' OR entry_number ILIKE '%36%' OR memo ILIKE '%36%'`);
  console.log('Journal Entry matches:', resJE.rows);

  // All recent payments
  const allPay = await pool.query(`SELECT id, payment_number, reference, amount, type, created_at FROM payment ORDER BY created_at DESC LIMIT 5`);
  console.log('\nLatest 5 Payments:');
  console.log(allPay.rows);
}

run().catch(console.error).finally(() => pool.end());
