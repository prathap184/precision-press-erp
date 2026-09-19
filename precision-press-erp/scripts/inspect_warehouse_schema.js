const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'warehouse'
    ORDER BY ordinal_position;
  `);
  console.log('--- warehouse Columns ---');
  console.table(cols.rows);

  const data = await client.query('SELECT * FROM warehouse');
  console.log('--- Current warehouse Rows ---');
  console.table(data.rows);

  await client.end();
}

run().catch(console.error);
