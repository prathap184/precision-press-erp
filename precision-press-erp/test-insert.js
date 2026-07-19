require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('payments').insert({
    id: 'PAY-TEST-' + Date.now(),
    orderId: 'test',
    userId: 'test',
    paymentMode: 'CASH',
    amount: 100
  });
  console.log('Error:', error);
}
run();
