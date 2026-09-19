const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT
      tc.table_name, kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'warehouse';
  `);
  console.log('--- Tables referencing warehouse ---');
  console.table(res.rows);

  // Check row counts of referencing tables
  for (const r of res.rows) {
    const c = await client.query(`SELECT count(*) FROM "${r.table_name}"`);
    console.log(`${r.table_name} count: ${c.rows[0].count}`);
  }

  await client.end();
}

run().catch(console.error);
