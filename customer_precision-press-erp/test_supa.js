const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log("URL:", supabaseUrl);
console.log("KEY prefix:", supabaseServiceKey.substring(0, 15));

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function test() {
  const customerId = '2d98a6b8-6067-4b1b-9bbc-f8fa6629fa08';
  console.log('Fetching for:', customerId);
  const { data, error } = await supabaseServer
    .from('quotations')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'PENDING');
  console.log('Result:', data?.length || 0, 'items');
  if (error) console.error(error);
}

test();
