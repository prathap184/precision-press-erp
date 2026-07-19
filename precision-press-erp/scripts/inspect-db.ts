import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env: URL=', supabaseUrl, ' KEY=', supabaseKey ? 'PRESENT' : 'MISSING');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('Fetching list of tables...');
  const tablesToCheck = ['profiles', 'customers', 'orders', 'order_items', 'transactions', 'accounts_ledger', 'document_jobs', 'invoices'];
  for (const table of tablesToCheck) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table "${table}": Error - ${error.message}`);
    } else {
      console.log(`Table "${table}": OK (found ${data?.length || 0} rows)`);
      if (data && data.length > 0) {
        console.log(`Sample columns for ${table}:`, Object.keys(data[0]));
      }
    }
  }
}

inspect();
