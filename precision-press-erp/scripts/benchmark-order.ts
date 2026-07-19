import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { createCustomerGroupedOrders } from '../src/lib/workflow';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runBenchmark() {
  console.log('Running Order Placement Benchmark (BEFORE Optimization)...');
  
  // 1. Get a test customer
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)
    .single();

  if (profileErr || !profile) {
    console.error('Error fetching test profile:', profileErr?.message || 'No profile found');
    process.exit(1);
  }

  console.log(`Using customer: ${profile.name} (Type: ${profile.customerType || 'CASH'})`);

  // 2. Setup mock auth context for CLI
  (global as any).__mockUser = {
    id: profile.id,
    name: profile.name || 'Test User',
    role: 'ADMIN',
    roles: ['ADMIN']
  };

  // Mock document actions to avoid generating receipts during benchmark
  // We can let them run or catch their logs, but they are part of the current workflow.

  const testItem = {
    id: `item_${Date.now()}_1`,
    productId: '6000', // standard product seeded
    productName: 'Sol Frontlit Flex 180',
    category: 'SOLVENT_PRINT',
    quantity: 1,
    subTotal: 100,
    rate: 10,
    width: 2,
    height: 5,
    materialMetadata: { materialType: 'standard' }
  };

  const testItem2 = {
    id: `item_${Date.now()}_2`,
    productId: '6200',
    productName: 'Eco Vinyl Matte',
    category: 'ECO_SOLVENT',
    quantity: 2,
    subTotal: 240,
    rate: 12,
    width: 2,
    height: 5,
    materialMetadata: { materialType: 'standard' }
  };

  const testItem3 = {
    id: `item_${Date.now()}_3`,
    productId: '6400',
    productName: 'UV Backlit Fabric',
    category: 'UV_ROLL',
    quantity: 1,
    subTotal: 450,
    rate: 45,
    width: 2,
    height: 5,
    materialMetadata: { materialType: 'standard' }
  };

  const cleanupIds: string[] = [];

  // --- Benchmark 1 Item ---
  console.log('\n--- Benchmarking 1 Item placement ---');
  const start1 = Date.now();
  const res1 = await createCustomerGroupedOrders(
    { id: profile.id, name: profile.name, type: profile.customerType || 'CASH' },
    {
      grandTotal: 118, // 100 + 18% GST
      items: [testItem],
      snapshot: {},
      customerSnapshot: { name: profile.name },
      deliveryChoice: 'PICKUP',
      shippingAddress: ''
    }
  );
  const time1 = Date.now() - start1;
  console.log(`Result: Success=${res1.success}, OrderId=${res1.orderId}`);
  console.log(`Time taken: ${time1} ms`);
  if (res1.orderId) cleanupIds.push(res1.orderId);

  // --- Benchmark 3 Items ---
  console.log('\n--- Benchmarking 3 Items placement ---');
  const start3 = Date.now();
  const res3 = await createCustomerGroupedOrders(
    { id: profile.id, name: profile.name, type: profile.customerType || 'CASH' },
    {
      grandTotal: 932.2, // (100 + 240 + 450) = 790 + 18% GST (142.2) = 932.2
      items: [
        { ...testItem, id: `item_${Date.now()}_a` },
        { ...testItem2, id: `item_${Date.now()}_b` },
        { ...testItem3, id: `item_${Date.now()}_c` }
      ],
      snapshot: {},
      customerSnapshot: { name: profile.name },
      deliveryChoice: 'PICKUP',
      shippingAddress: ''
    }
  );
  const time3 = Date.now() - start3;
  console.log(`Result: Success=${res3.success}, OrderId=${res3.orderId}, Children=${res3.orderIds?.join(', ')}`);
  console.log(`Time taken: ${time3} ms`);
  if (res3.orderId) cleanupIds.push(res3.orderId);
  if (res3.orderIds) cleanupIds.push(...res3.orderIds);

  // 4. Database cleanup
  console.log('\nCleaning up benchmark orders...');
  if (cleanupIds.length > 0) {
    const { error: err1 } = await supabase.from('orders').delete().in('id', cleanupIds);
    const { error: err2 } = await supabase.from('order_items').delete().in('order_id', cleanupIds);
    const { error: err3 } = await supabase.from('transactions').delete().in('refId', cleanupIds);
    if (err1 || err2 || err3) {
      console.warn('Cleanup warning:', err1?.message, err2?.message, err3?.message);
    } else {
      console.log('Cleanup completed successfully.');
    }
  }

  // Restore used credit to original
  const { error: restoreErr } = await supabase
    .from('profiles')
    .update({ usedCredit: profile.usedCredit })
    .eq('id', profile.id);
  if (restoreErr) console.warn('Restore credit warning:', restoreErr.message);

  console.log('\nBenchmark Results Summary:');
  console.log(`1 Item placement: ${time1} ms`);
  console.log(`3 Items placement: ${time3} ms`);
}

runBenchmark().catch(console.error);
