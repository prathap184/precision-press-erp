// scripts/find_id.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function find() {
  const client = postgres(process.env.DATABASE_URL);
  const targetId = '17de4a22-d16e-4456-9074-287e25e5a5e5';
  
  const je = await client`SELECT * FROM journal_entry WHERE id = ${targetId}`;
  if (je.length) console.log('Found in journal_entry:', je[0]);

  const pmt = await client`SELECT * FROM payment WHERE id = ${targetId}`;
  if (pmt.length) console.log('Found in payment:', pmt[0]);

  const cc = await client`SELECT * FROM customer_credit WHERE id = ${targetId}`;
  if (cc.length) console.log('Found in customer_credit:', cc[0]);

  const inv = await client`SELECT * FROM invoice WHERE id = ${targetId}`;
  if (inv.length) console.log('Found in invoice:', inv[0]);

  await client.end();
}
find().catch(console.error);
