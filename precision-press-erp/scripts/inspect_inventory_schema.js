const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE '%unit%' 
        OR table_name LIKE '%uom%' 
        OR table_name LIKE '%godown%' 
        OR table_name LIKE '%warehouse%' 
        OR table_name LIKE '%location%' 
        OR table_name LIKE '%stock%' 
        OR table_name LIKE '%inventory%')
    ORDER BY table_name;
  `);
  console.log('--- Matching Tables ---');
  console.log(tables.rows.map(r => r.table_name));

  const itemCols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'inventory_item'
    ORDER BY ordinal_position;
  `);
  console.log('\n--- inventory_item Columns ---');
  console.table(itemCols.rows);

  await client.end();
}

run().catch(console.error);
