const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

async function inspectInv() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 1. Check public.categories
  console.log('=== public.categories ===');
  const catRows = await pool.query('SELECT * FROM public.categories');
  console.table(catRows.rows);

  // 2. Check public.inventory_category
  console.log('\n=== public.inventory_category ===');
  const invCatCols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_category'
    ORDER BY ordinal_position
  `);
  console.table(invCatCols.rows);
  const invCatRows = await pool.query('SELECT * FROM public.inventory_category');
  console.log('Row count in inventory_category:', invCatRows.rows.length);
  if (invCatRows.rows.length > 0) console.table(invCatRows.rows);

  // 3. Check public.inventory_item
  console.log('\n=== public.inventory_item ===');
  const invItemCols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_item'
    ORDER BY ordinal_position
  `);
  console.table(invItemCols.rows);

  await pool.end();
}

inspectInv().catch(console.error);
