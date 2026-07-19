import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testCounts() {
  console.log('Testing stats queries directly in Supabase...');
  try {
    // 1. Total count
    const { count: total, error: err1 } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });
    
    if (err1) console.error('Error total:', err1);
    else console.log('Total orders:', total);

    // 2. Active count (not in COMPLETED, DISPATCHED, CANCELLED)
    const { count: active, error: err2 } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', '(COMPLETED,DISPATCHED,CANCELLED)');
    
    if (err2) console.error('Error active:', err2);
    else console.log('Active orders count (without DELIVERED):', active);

    // 3. Completed count (in COMPLETED, DISPATCHED)
    const { count: completed, error: err3 } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['COMPLETED', 'DISPATCHED']);
    
    if (err3) console.error('Error completed:', err3);
    else console.log('Completed orders count (without DELIVERED):', completed);
    
    // 4. Active count (with DELIVERED excluded)
    const { count: activeWithDelivered, error: err4 } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', '(COMPLETED,DISPATCHED,CANCELLED,DELIVERED)');
    
    if (err4) console.error('Error active with delivered:', err4);
    else console.log('Active orders count (with DELIVERED excluded):', activeWithDelivered);

    // 5. Completed count (with DELIVERED included)
    const { count: completedWithDelivered, error: err5 } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['COMPLETED', 'DISPATCHED', 'DELIVERED']);
    
    if (err5) console.error('Error completed with delivered:', err5);
    else console.log('Completed orders count (with DELIVERED included):', completedWithDelivered);

  } catch (error) {
    console.error('Error:', error);
  }
}

testCounts().then(() => process.exit(0)).catch(console.error);
