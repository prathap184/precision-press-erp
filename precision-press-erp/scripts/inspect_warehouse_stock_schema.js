const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'warehouse_stock'
    ORDER BY ordinal_position;
  `);
  console.log('--- warehouse_stock Columns ---');
  console.table(cols.rows);

  await client.end();
}

run().catch(console.error);
