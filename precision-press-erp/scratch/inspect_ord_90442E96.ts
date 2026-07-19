import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectOrder() {
  const orderId = 'ORD-90442E96';
  console.log(`Inspecting order: ${orderId}...`);

  // Query order doc
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) {
    console.error('Error fetching order:', orderError);
  } else if (!order) {
    console.log('Order not found!');
  } else {
    console.log('Order found:');
    console.log('  Status:', order.status);
    console.log('  Payment Status:', order.paymentStatus);
    console.log('  Workflow:', JSON.stringify(order.workflow, null, 2));
    console.log('  Amounts:', JSON.stringify(order.amounts, null, 2));
  }

  // Query child/grouped orders
  const { data: childOrders, error: childError } = await supabase
    .from('orders')
    .select('id, status, workflow')
    .or(`id.eq.${orderId},workflow->>baseOrderId.eq.${orderId}`);

  if (childError) {
    console.error('Error fetching child/grouped orders:', childError);
  } else {
    console.log('\nAll associated orders (including base/grouped/child):');
    childOrders.forEach((o: any) => {
      console.log(`  Order: ${o.id}`);
      console.log(`    Status: ${o.status}`);
      console.log(`    baseOrderId: ${o.workflow?.baseOrderId}`);
      console.log(`    groupOrderIds: ${JSON.stringify(o.workflow?.groupOrderIds)}`);
    });
  }

  // Query order items
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (itemsError) {
    console.error('Error fetching order items:', itemsError);
  } else {
    console.log(`\nOrder Items (count: ${items?.length}):`);
    items?.forEach(item => {
      console.log(`  Item ID: ${item.id}`);
      console.log(`    Status: ${item.status}`);
      console.log(`    Product Name: ${item.productName}`);
    });
  }

  // Query background jobs
  const { data: jobs, error: jobsError } = await supabase
    .from('document_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (jobsError) {
    console.error('Error fetching jobs:', jobsError);
  } else {
    console.log('\nRecent document jobs:');
    jobs?.forEach(job => {
      console.log(`  Job ID: ${job.id}`);
      console.log(`    Job Type: ${job.job_type || job.jobType}`);
      console.log(`    Status: ${job.status}`);
      console.log(`    Payload:`, JSON.stringify(job.payload || job.metadata));
      console.log(`    Error/Attempts: ${job.attempts} attempts, error: ${job.error || job.errorMessage}`);
    });
  }
}

inspectOrder().catch(console.error);
