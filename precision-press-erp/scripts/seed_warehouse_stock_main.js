const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('--- Seeding warehouse_stock for Main Location ---');

  // 1. Get Main Location warehouse ID
  const whRes = await client.query(`SELECT id FROM public.warehouse WHERE organization_id = $1 AND code = 'MAIN'`, [DEFAULT_ORG_ID]);
  if (whRes.rows.length === 0) {
    throw new Error('Main Location warehouse not found!');
  }
  const mainWhId = whRes.rows[0].id;
  console.log('Main Location Warehouse ID:', mainWhId);

  // 2. Insert warehouse_stock for all items
  const res = await client.query(`
    INSERT INTO public.warehouse_stock (organization_id, inventory_item_id, warehouse_id, quantity)
    SELECT 
      organization_id, 
      id AS inventory_item_id, 
      $1 AS warehouse_id, 
      quantity_on_hand AS quantity
    FROM public.inventory_item
    WHERE organization_id = $2
    ON CONFLICT (organization_id, inventory_item_id, warehouse_id)
    DO UPDATE SET 
      quantity = EXCLUDED.quantity,
      updated_at = now()
    RETURNING id;
  `, [mainWhId, DEFAULT_ORG_ID]);

  console.log(`? Linked ${res.rows.length} items to Main Location in public.warehouse_stock!`);

  // Verify
  const count = await client.query('SELECT count(*) FROM public.warehouse_stock WHERE organization_id = $1', [DEFAULT_ORG_ID]);
  console.log(`Total rows in warehouse_stock: ${count.rows[0].count}`);

  await client.end();
}

run().catch(console.error);
