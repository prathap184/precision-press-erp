require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log('--- 1. Current columns in inventory_category ---');
  const cols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'inventory_category'
    ORDER BY ordinal_position;
  `);
  console.log(cols.rows.map(c => `${c.column_name} (${c.data_type})`).join('\n'));

  console.log('\n--- 2. Adding columns to inventory_category if missing ---');
  await pool.query(`
    ALTER TABLE inventory_category 
    ADD COLUMN IF NOT EXISTS treat_sales_as_manufactured BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS ignore_negative_stock BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS treat_purchases_as_consumed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  `);
  console.log('Columns added or already exist!');

  console.log('\n--- 3. Verify new columns ---');
  const newCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'inventory_category'
    ORDER BY ordinal_position;
  `);
  console.log(newCols.rows.map(c => `${c.column_name} (${c.data_type})`).join('\n'));
}

main().catch(console.error).finally(() => pool.end());
