const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const res = await c.query(`
    SELECT ws.id, w.name, w.code, ws.quantity 
    FROM warehouse_stock ws 
    JOIN warehouse w ON ws.warehouse_id = w.id 
    WHERE ws.inventory_item_id = '408b670c-7ca2-45be-92b3-b09b6a6535c8'
  `);
  console.table(res.rows);

  await c.end();
}

run().catch(console.error);
