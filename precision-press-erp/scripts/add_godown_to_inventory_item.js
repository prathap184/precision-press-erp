const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Adding tally_godown column to public.inventory_item...');
  await client.query(`
    ALTER TABLE public.inventory_item 
    ADD COLUMN IF NOT EXISTS tally_godown text DEFAULT 'Main Location';
  `);

  const updateRes = await client.query(`
    UPDATE public.inventory_item 
    SET tally_godown = 'Main Location' 
    WHERE tally_godown IS NULL OR tally_godown = '';
  `);
  console.log(`Updated ${updateRes.rowCount} items with tally_godown = 'Main Location'.`);

  // Verify
  const check = await client.query(`
    SELECT count(*), tally_godown 
    FROM public.inventory_item 
    GROUP BY tally_godown;
  `);
  console.log('--- Inventory Items Godown Breakdown ---');
  console.table(check.rows);

  await client.end();
}

run().catch(console.error);
