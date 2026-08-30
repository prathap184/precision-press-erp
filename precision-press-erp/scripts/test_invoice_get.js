// scripts/test_invoice_get.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function testGet() {
  const sql = postgres(process.env.DATABASE_URL);
  const id = '2143fdea-c6a1-458a-9296-6468f300c72c';

  const [inv] = await sql`SELECT * FROM invoice WHERE id = ${id} AND deleted_at IS NULL`;
  console.log('Invoice found:', !!inv);

  const lines = await sql`SELECT * FROM invoice_line WHERE invoice_id = ${id}`;
  console.log('Lines count:', lines.length);

  const allocations = await sql`
    SELECT pa.*, p.payment_number, p.date as payment_date, p.method, p.reference, p.notes, p.journal_entry_id
    FROM payment_allocation pa
    JOIN payment p ON p.id = pa.payment_id
    WHERE pa.document_type = 'invoice' AND pa.document_id = ${id}
  `;
  console.log('Allocations:', allocations);

  await sql.end();
}
testGet().catch(console.error);
