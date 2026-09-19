const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`
    SELECT 
      has_multiple_sizes, 
      count(*) 
    FROM public.inventory_item 
    WHERE organization_id = '00000000-0000-0000-0000-000000000002'
    GROUP BY has_multiple_sizes
  `);
  console.table(res.rows);
  await client.end();
}
check();