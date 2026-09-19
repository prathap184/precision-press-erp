const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type, udt_name, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'inventory_item' 
    ORDER BY ordinal_position;
  `);
  console.table(res.rows);

  await client.end();
}

run().catch(console.error);
