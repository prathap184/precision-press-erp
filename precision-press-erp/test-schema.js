
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function checkSchema() {
  await client.connect();
  const tables = ['invoices', 'invoice_events', 'invoice_generation_attempts', 'invoice_sequences', 'company_profile', 'hsn_master', 'hsn_gst_rates', 'products'];
  
  for (const table of tables) {
    console.log('\n--- Table:', table, '---');
    const cols = await client.query(SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name= ORDER BY ordinal_position, [table]);
    cols.rows.forEach(r => console.log(  :  (Nullable: , Default: )));
    
    const constraints = await client.query(SELECT conname, pg_get_constraintdef(c.oid) as def FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = , [table]);
    constraints.rows.forEach(r => console.log(  CONSTRAINT : ));
    
    const indexes = await client.query(SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = , [table]);
    indexes.rows.forEach(r => console.log(  INDEX : ));
  }
  await client.end();
}
checkSchema().catch(console.error);

