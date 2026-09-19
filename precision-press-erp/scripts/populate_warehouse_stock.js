const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query('BEGIN');

  try {
    // 1. Get Main Location Warehouse ID
    const whRes = await client.query(`
      SELECT id, name, code 
      FROM public.warehouse 
      WHERE organization_id = $1 AND code = 'MAIN';
    `, [DEFAULT_ORG_ID]);

    if (whRes.rows.length === 0) {
      throw new Error('Main Location warehouse not found!');
    }
    const mainWhId = whRes.rows[0].id;
    console.log(`Found Main Location ID: ${mainWhId}`);

    // 2. Remove dummy warehouses B1 and B2
    const delWh = await client.query(`
      DELETE FROM public.warehouse 
      WHERE organization_id = $1 AND code IN ('B1', 'B2');
    `, [DEFAULT_ORG_ID]);
    console.log(`Deleted ${delWh.rowCount} dummy seed warehouses (B1, B2).`);

    // 3. Populate warehouse_stock for all items
    const itemsRes = await client.query(`
      SELECT id, quantity_on_hand 
      FROM public.inventory_item 
      WHERE organization_id = $1;
    `, [DEFAULT_ORG_ID]);

    console.log(`Populating warehouse_stock for ${itemsRes.rows.length} items...`);

    let count = 0;
    for (const itm of itemsRes.rows) {
      await client.query(`
        INSERT INTO public.warehouse_stock (
          organization_id, inventory_item_id, warehouse_id, quantity
        ) VALUES (
          $1, $2, $3, $4
        )
        ON CONFLICT (organization_id, inventory_item_id, warehouse_id)
        DO UPDATE SET
          quantity = EXCLUDED.quantity,
          updated_at = now();
      `, [DEFAULT_ORG_ID, itm.id, mainWhId, itm.quantity_on_hand]);
      count++;
    }

    await client.query('COMMIT');
    console.log(`?? Successfully linked ${count} items to Main Location in warehouse_stock!`);

    // Verify for the item from user screenshot
    const testItem = await client.query(`
      SELECT 
        ws.id, i.name, w.name as warehouse_name, w.code as warehouse_code, ws.quantity
      FROM public.warehouse_stock ws
      JOIN public.inventory_item i ON i.id = ws.inventory_item_id
      JOIN public.warehouse w ON w.id = ws.warehouse_id
      WHERE ws.inventory_item_id = '408b670c-7ca2-45be-92b3-b09b6a6535c8';
    `);
    console.log('\n--- Verification for 3m Black Back Vinyl (screenshot item) ---');
    console.table(testItem.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('? Error:', err.message);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
