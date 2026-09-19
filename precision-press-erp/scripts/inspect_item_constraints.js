const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conrelid = 'inventory_item'::regclass;
  `);
  console.log('--- Constraints on inventory_item ---');
  console.table(res.rows);

  const idxRes = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'inventory_item';
  `);
  console.log('\n--- Indexes on inventory_item ---');
  console.table(idxRes.rows);

  await client.end();
}

run().catch(console.error);
