import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  // 1. Reset the order
  const { error: orderErr } = await supabase
    .from('orders')
    .update({ invoice_generated: false, invoice_id: null, invoice_number: null, invoice_status: null })
    .eq('id', 'ORD-04DCC901-item1');

  if (orderErr) console.error('Order reset error:', orderErr);
  else console.log('Order reset successfully');

  // 2. Delete ALL invoices for this order just to clean it up completely
  const { error: invErr } = await supabase
    .from('invoices')
    .delete()
    .eq('parent_order_id', 'ORD-04DCC901');

  if (invErr) console.error('Invoice delete error:', invErr);
  else console.log('Invoices deleted successfully');
}

fix();
