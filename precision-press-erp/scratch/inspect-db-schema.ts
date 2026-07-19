import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
  // Querying information_schema tables
  const { data: tables, error: tablesErr } = await supabase
    .from('orders') // Just checking tables via RPC or direct select if information_schema is exposed
    .select('id')
    .limit(1);
    
  console.log('Query orders success:', !tablesErr);

  // We can query custom information via RPC if we have an RPC function to execute SQL. 
  // Let's see if we can read profiles table columns or check if idempotency_keys exists.
  const { data: keysData, error: keysErr } = await supabase
    .from('idempotency_keys')
    .select('*')
    .limit(1);

  if (keysErr) {
    console.log('idempotency_keys table does not exist or error:', keysErr.message);
  } else {
    console.log('idempotency_keys table exists! Sample data:', keysData);
  }
}

inspectSchema().catch(console.error);
