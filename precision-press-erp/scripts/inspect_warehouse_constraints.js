const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.conrelid = 'warehouse'::regclass;
  `);
  console.log('--- Constraints on warehouse ---');
  console.table(res.rows);

  const idx = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'warehouse';`);
  console.log('--- Indexes on warehouse ---');
  console.table(idx.rows);

  await client.end();
}

run().catch(console.error);
