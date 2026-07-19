require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('orders').select('*').limit(1).then(r => console.log('ORDERS:', Object.keys(r.data[0] || {}), 'ERR:', r.error));
s.from('order_items').select('*').limit(1).then(r => console.log('ORDER_ITEMS:', Object.keys(r.data[0] || {}), 'ERR:', r.error));
