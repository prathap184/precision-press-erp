const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT id, name, code, metadata, tally_billing_mode 
    FROM public.inventory_item 
    WHERE id = '408b670c-7ca2-45be-92b3-b09b6a6535c8';
  `);
  console.log('--- Item from screenshot ---');
  console.log(res.rows[0]);

  const anyB1 = await client.query(`
    SELECT count(*) 
    FROM public.inventory_item 
    WHERE description ILIKE '%B1%' 
       OR metadata::text ILIKE '%B1%' 
       OR code ILIKE '%B1%';
  `);
  console.log('Items containing B1 anywhere in description, metadata, or code:', anyB1.rows[0].count);

  await client.end();
}

run().catch(console.error);
