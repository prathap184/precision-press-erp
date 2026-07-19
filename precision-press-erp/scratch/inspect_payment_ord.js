require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const ordId = 'ORD-775167';

  // 1. Fetch by id
  const { data: byId } = await supabase
    .from('payments')
    .select('*')
    .eq('id', ordId);
  console.log(`Payments with ID "${ordId}":`, byId);

  // 2. Fetch by orderId
  const { data: byOrderId } = await supabase
    .from('payments')
    .select('*')
    .eq('orderId', ordId);
  console.log(`Payments with orderId "${ordId}":`, byOrderId);

  // 3. Fetch order
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', ordId)
    .maybeSingle();
  console.log('Order:', order);
}

check().catch(console.error);
