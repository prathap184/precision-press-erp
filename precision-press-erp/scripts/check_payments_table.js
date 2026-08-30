// scripts/check_payments_table.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function check() {
  const sql = postgres(process.env.DATABASE_URL);
  const pmts = await sql`SELECT id, payment_number, reference, journal_entry_id, method, amount FROM payment`;
  console.log('PAYMENTS in DB:', pmts);
  const credits = await sql`SELECT id, journal_entry_id, original_amount FROM customer_credit`;
  console.log('CUSTOMER CREDITS in DB:', credits);
  await sql.end();
}
check().catch(console.error);
