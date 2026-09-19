const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`DELETE FROM public.warehouse WHERE code IN ('B1', 'B2') RETURNING name, code;`);
  console.log('Deleted dummy warehouses:', res.rows);

  const remaining = await client.query('SELECT id, name, code, is_default, is_active, tally_guid FROM public.warehouse');
  console.log('--- Remaining Active Warehouses in DB ---');
  console.table(remaining.rows);

  await client.end();
}

run().catch(console.error);
