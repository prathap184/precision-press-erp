require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const res = await pool.query(`
    SELECT i.id, i.name, i.category, i.tally_stock_group, i.unit_of_measure, i.has_multiple_sizes, i.category_id,
           c.name as cat_name, c.treat_sales_as_manufactured
    FROM inventory_item i
    LEFT JOIN inventory_category c ON i.category_id = c.id
    WHERE i.name ILIKE '%Translit Max FX%'
  `);
  console.log(res.rows);
}

check().catch(console.error).finally(() => pool.end());
