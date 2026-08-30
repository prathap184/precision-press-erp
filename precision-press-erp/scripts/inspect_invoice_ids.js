// scripts/inspect_invoice_ids.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function check() {
  const sql = postgres(process.env.DATABASE_URL);
  
  const targetId = '2143fdea-c6a1-458a-9296-6468f300c72c';
  console.log('Searching for ID:', targetId);

  const inv = await sql`SELECT * FROM invoice WHERE id = ${targetId}`;
  console.log('In invoice table:', inv);

  const je = await sql`SELECT * FROM journal_entry WHERE id = ${targetId}`;
  console.log('In journal_entry table:', je);

  const pmt = await sql`SELECT * FROM payment WHERE id = ${targetId}`;
  console.log('In payment table:', pmt);

  console.log('\n--- ALL INVOICES IN DB ---');
  const allInvoices = await sql`SELECT id, invoice_number, total, amount_paid, amount_due, status, journal_entry_id FROM invoice ORDER BY created_at DESC`;
  console.log(allInvoices);

  await sql.end();
}
check().catch(console.error);
