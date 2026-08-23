const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectErpGstTables() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       🔍 ERP DATABASE SCHEMA & GST COLUMN AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Query table columns using Postgres information_schema via RPC or direct SQL
  const { data: cols, error } = await supabase.rpc('get_table_columns');
  
  // Or check specific tables directly
  const testTables = ['invoice', 'invoice_item', 'bill', 'bill_item', 'payment', 'customer_credit', 'journal_entry_line', 'product'];
  for (const t of testTables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`[!] Table ${t}: ${error.message}`);
    } else {
      console.log(`[OK] Table "${t}" exists.`);
    }
  }
}
inspectErpGstTables();
