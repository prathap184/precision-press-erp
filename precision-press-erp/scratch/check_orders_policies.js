const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Use service role key to have full access and query system catalog
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPolicies() {
  const { data, error } = await supabase.rpc('get_policies', {}, { head: false });
  if (error) {
    // If get_policies function doesn't exist, query pg_policies directly
    const { data: policies, error: err2 } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'orders');
    if (err2) {
      // Query via raw SQL if possible, or try checking pg_policies using select *
      // Since pg_policies is a system view, we might not be able to query it directly via postgrest unless public has permission, 
      // but let's try calling a SQL execution if we have one or just fetch policies using a simple rpc or sql.
      console.error('Failed to query pg_policies:', err2);
    } else {
      console.log('Policies on orders:', policies);
    }
  } else {
    console.log('get_policies result:', data);
  }
}

// Let's run a query to get policies from pg_policies via pg_catalog or a custom sql function
async function checkViaSQL() {
  // Let's see if we can do it via a direct postgres query or just query pg_policies if it's exposed
  const { data, error } = await supabase
    .rpc('execute_sql', { sql_query: "SELECT * FROM pg_policies WHERE tablename = 'orders';" });
  if (error) {
    console.log('RPC execute_sql failed, trying direct select on pg_policies (if exposed):');
    const { data: d2, error: e2 } = await supabase.from('pg_policies').select('*');
    if (e2) {
      console.log('Could not get policies directly. Let\'s check RLS status on orders:');
      const { data: d3, error: e3 } = await supabase.rpc('execute_sql', { sql_query: "SELECT relrowsecurity FROM pg_class WHERE relname = 'orders';" });
      if (e3) {
        console.error('Could not query relrowsecurity:', e3);
      } else {
        console.log('relrowsecurity on orders:', d3);
      }
    } else {
      console.log('pg_policies:', d2);
    }
  } else {
    console.log('Policies on orders table:', data);
  }
}

checkViaSQL().catch(console.error);
