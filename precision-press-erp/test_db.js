const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/precision_press_erp' }); // Try default local DB if no env
async function run() {
  const res = await pool.query("SELECT id, entry_number, date, description, reference, source_type, source_module, voucher_type FROM journal_entry ORDER BY created_at DESC LIMIT 10;");
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
run().catch(console.error);
