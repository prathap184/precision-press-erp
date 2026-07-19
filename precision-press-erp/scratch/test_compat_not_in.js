const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// We manually mock the compat layer's fetchRows behavior to see what it does
async function test() {
  const fieldName = 'status';
  const constraintValue = ['COMPLETED', 'DISPATCHED', 'CANCELLED'];
  const formattedInValue = `(${constraintValue.map((item) => JSON.stringify(item)).join(',')})`;
  console.log('PostgREST not-in string:', formattedInValue);

  // Let's run a query with this string:
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .not(fieldName, 'in', formattedInValue);

  if (error) {
    console.error('Query failed:', error);
  } else {
    console.log('Query succeeded! Total orders returned:', data.length);
    console.log('Unique statuses in result:', Array.from(new Set(data.map(d => d.status))));
  }
}

test().catch(console.error);
