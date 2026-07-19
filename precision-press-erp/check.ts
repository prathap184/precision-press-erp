import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data } = await supabase
    .from('orders')
    .select('*')
    .eq('id', 'ORD-04DCC901-item1');
  console.log(JSON.stringify(data, null, 2));

  const { data: invData } = await supabase
    .from('invoices')
    .select('*')
    .eq('parent_order_id', 'ORD-04DCC901')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log("INVOICE DATA:");
  console.log(JSON.stringify(invData, null, 2));
}
check();
