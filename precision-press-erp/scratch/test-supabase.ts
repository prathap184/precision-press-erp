import { supabaseServer } from '../src/lib/supabase-server';

async function test() {
  const { data: order, error: orderErr } = await supabaseServer.from('orders').select('*').eq('id', 'ORD-836633').single();
  console.log('Order:', order, 'Error:', orderErr);

  const { data: items, error: itemsErr } = await supabaseServer.from('order_items').select('*');
  console.log('All Items in order_items:', items, 'Error:', itemsErr);
}

test().then(() => process.exit(0)).catch(console.error);
