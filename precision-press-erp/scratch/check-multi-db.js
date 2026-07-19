const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Service Role Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Querying orders from Supabase with baseOrderId...');
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .not('baseOrderId', 'is', null)
    .limit(10);

  if (error) {
    console.error('Supabase query error:', error);
    process.exit(1);
  }

  console.log(`Found ${orders.length} orders with baseOrderId.`);
  for (const order of orders) {
    console.log(`Order ID: ${order.id}`);
    console.log(`  baseOrderId: ${order.baseOrderId}`);
    console.log(`  amounts:`, typeof order.amounts === 'string' ? JSON.parse(order.amounts) : order.amounts);
    console.log(`  groupOrderIds:`, order.groupOrderIds || order.workflow?.groupOrderIds);
    console.log(`  items:`, typeof order.items === 'string' ? JSON.parse(order.items) : order.items);
  }
}

run().catch(console.error);
