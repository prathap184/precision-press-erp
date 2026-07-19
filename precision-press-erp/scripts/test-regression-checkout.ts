import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Import workflow actions
import { createCustomerGroupedOrders } from '../src/lib/workflow';

async function runRegressionTests() {
  console.log('============================================================');
  console.log('📊 PRECISION PRESS ERP - PHASE 4 REGRESSION TESTS');
  console.log('============================================================');

  // 1. Get/Create test customer profiles
  const { data: customer, error: customerErr } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)
    .single();

  if (customerErr || !customer) {
    console.error('❌ Error fetching test customer profile:', customerErr?.message);
    process.exit(1);
  }

  console.log(`👤 Active Customer Profile: ${customer.name} (${customer.id})`);
  console.log(`   Customer Type: ${customer.customerType || 'CASH'}`);
  console.log(`   Credit Limit: ₹${customer.creditLimit || 0} | Used Credit: ₹${customer.usedCredit || 0}`);

  const cleanupIds: string[] = [];

  const testProduct1 = {
    id: '6000',
    productId: '6000',
    productName: 'Sol Frontlit Flex 180',
    category: 'SOLVENT_PRINT',
    quantity: 1,
    subTotal: 100,
    rate: 10,
    width: 2,
    height: 5,
    materialMetadata: { materialType: 'standard' },
    fileUrl: 'https://example.com/artwork1.png'
  };

  const testProduct2 = {
    id: '6200',
    productId: '6200',
    productName: 'Eco Vinyl Matte',
    category: 'ECO_SOLVENT',
    quantity: 2,
    subTotal: 240,
    rate: 12,
    width: 2,
    height: 5,
    materialMetadata: { materialType: 'standard' },
    fileUrl: 'DESIGN_BY_US'
  };

  try {
    // ------------------------------------------------------------
    // TEST CASE 1: Single-Item Cash Checkout (Customer Flow)
    // ------------------------------------------------------------
    console.log('\n------------------------------------------------------------');
    console.log('🧪 TEST CASE 1: Single-Item Cash Checkout (Customer Flow)');
    console.log('------------------------------------------------------------');

    // Mock Customer Auth
    (global as any).__mockUser = {
      id: customer.id,
      name: customer.name || 'Test Customer',
      role: 'CUSTOMER',
      roles: ['CUSTOMER']
    };

    const payload1 = {
      grandTotal: 118, // 100 + 18% GST (18.00)
      items: [testProduct1],
      snapshot: {},
      customerSnapshot: { name: customer.name, state: 'Maharashtra' },
      deliveryChoice: 'PICKUP',
      shippingAddress: '',
      voucherDiscount: 0,
      discount: 0,
      idempotencyKey: `idemp-1-${Date.now()}`
    };

    const res1 = await createCustomerGroupedOrders(
      { id: customer.id, name: customer.name, type: 'CASH' },
      payload1
    );

    if (!res1.success) throw new Error(`Case 1 failed to place order: ${res1.duplicate ? 'Duplicate' : 'Unknown error'}`);
    console.log(`✅ Order placed successfully! Parent ID: ${res1.orderId}`);
    if (res1.orderId) cleanupIds.push(res1.orderId);

    // Verify DB states for Parent
    const { data: parentOrder1 } = await supabase
      .from('orders')
      .select('*')
      .eq('id', res1.orderId)
      .single();

    if (!parentOrder1) throw new Error('Parent order not found in DB');
    console.log(`   - Status: ${parentOrder1.status} (Expected: PLACED)`);
    console.log(`   - Payment Status: ${parentOrder1.paymentStatus} (Expected: PENDING)`);
    console.log(`   - Grand Total: ₹${parentOrder1.amounts.grandTotal} (Expected: ₹118)`);
    console.log(`   - GST Charged: ₹${parentOrder1.amounts.gst}`);
    console.log(`   - Transport Charges: ₹${parentOrder1.amounts.transport} (Expected: ₹0)`);

    // Verify Ledger Entry
    const { data: ledger1 } = await supabase
      .from('transactions')
      .select('*')
      .eq('refId', res1.orderId);

    console.log(`   - Ledger Transactions created: ${ledger1?.length || 0} (Expected: 1)`);
    if (ledger1 && ledger1.length > 0) {
      console.log(`     * Type: ${ledger1[0].type} | Debit: ₹${ledger1[0].debit} | Credit: ₹${ledger1[0].credit}`);
    }

    // ------------------------------------------------------------
    // TEST CASE 2: Multi-Item Credit Checkout with Voucher & Transport
    // ------------------------------------------------------------
    console.log('\n------------------------------------------------------------');
    console.log('🧪 TEST CASE 2: Multi-Item Credit Checkout with Voucher & Transport');
    console.log('------------------------------------------------------------');

    // Ensure customer has enough credit limit
    await supabase
      .from('profiles')
      .update({ creditLimit: 50000, usedCredit: 0 })
      .eq('id', customer.id);

    const payload2 = {
      // Gross = Flex (100) + Vinyl (240) + Transport (150) = 490
      // Voucher Discount = 50 (Type 0 flat rate)
      // Subtotal = 490 - 50 = 440
      // GST (18%) = 440 * 0.18 = 79.20
      // Grand Total = 440 + 79.20 = 519.20
      grandTotal: 519.20,
      items: [
        { ...testProduct1, id: `item-a-${Date.now()}` },
        { ...testProduct2, id: `item-b-${Date.now()}` }
      ],
      snapshot: {},
      customerSnapshot: { name: customer.name, state: 'Maharashtra' },
      deliveryChoice: 'TRANSPORT',
      shippingAddress: 'Transport Office yard, Mumbai',
      deliveryPricingSnapshot: { choice: 'TRANSPORT', amount: 150 },
      voucherDiscount: 50,
      discount: 0,
      idempotencyKey: `idemp-2-${Date.now()}`
    };

    const res2 = await createCustomerGroupedOrders(
      { id: customer.id, name: customer.name, type: 'CREDIT' },
      payload2
    );

    if (!res2.success) throw new Error(`Case 2 failed to place order.`);
    console.log(`✅ Order placed successfully! Parent ID: ${res2.orderId}`);
    if (res2.orderId) cleanupIds.push(res2.orderId);
    if (res2.orderIds) cleanupIds.push(...res2.orderIds);

    // Verify Split Child Orders
    console.log(`   - Group Order IDs: ${res2.orderIds?.join(', ')}`);
    const { data: childOrders2 } = await supabase
      .from('orders')
      .select('*')
      .in('id', res2.orderIds || []);

    console.log(`   - Child orders created in DB: ${childOrders2?.length || 0} (Expected: 2)`);
    if (childOrders2) {
      childOrders2.forEach((child, idx) => {
        console.log(`     * Child ${idx + 1} ID: ${child.id}`);
        console.log(`       - Status: ${child.status} (Expected: PLACED)`);
        console.log(`       - Grand Total: ₹${child.amounts.grandTotal} (Expected: ₹0 - Split Financials Zeroed Out)`);
        console.log(`       - Base BaseOrderId: ${child.workflow?.baseOrderId} (Expected: ${res2.orderId})`);
      });
    }

    // Verify Ledger Balance Update
    const { data: customerPost2 } = await supabase
      .from('profiles')
      .select('usedCredit')
      .eq('id', customer.id)
      .single();
    console.log(`   - Used Credit updated on profile: ₹${customerPost2?.usedCredit} (Expected: ₹519.2)`);

    // ------------------------------------------------------------
    // TEST CASE 3: staff / ACDEMA Impersonated Proxy Checkout
    // ------------------------------------------------------------
    console.log('\n------------------------------------------------------------');
    console.log('🧪 TEST CASE 3: Staff / ACDEMA Impersonated Proxy Checkout');
    console.log('------------------------------------------------------------');

    // Mock ACDEMA Staff Auth
    (global as any).__mockUser = {
      id: 'staff-ac-dema-id',
      name: 'Accounts Impersonator',
      role: 'ACDEMA',
      roles: ['ACDEMA']
    };

    const payload3 = {
      grandTotal: 118,
      items: [{ ...testProduct1, id: `item-c-${Date.now()}` }],
      snapshot: {},
      customerSnapshot: { name: customer.name, state: 'Maharashtra' },
      deliveryChoice: 'PICKUP',
      shippingAddress: '',
      voucherDiscount: 0,
      discount: 0,
      proxyExecutor: { id: 'staff-ac-dema-id', name: 'Accounts Impersonator', role: 'ACDEMA' },
      idempotencyKey: `idemp-3-${Date.now()}`
    };

    const res3 = await createCustomerGroupedOrders(
      { id: customer.id, name: customer.name, type: 'CASH' },
      payload3
    );

    if (!res3.success) throw new Error(`Case 3 failed to place order.`);
    console.log(`✅ Order placed successfully! Parent ID: ${res3.orderId}`);
    if (res3.orderId) cleanupIds.push(res3.orderId);

    // Verify DB states for ACDEMA order
    const { data: parentOrder3 } = await supabase
      .from('orders')
      .select('*')
      .eq('id', res3.orderId)
      .single();

    if (!parentOrder3) throw new Error('ACDEMA Parent order not found in DB');
    console.log(`   - Status: ${parentOrder3.status} (Expected: ACCOUNTANT_APPROVED - Auto-Bypassed accountant gate)`);
    console.log(`   - Payment Status: ${parentOrder3.paymentStatus} (Expected: VERIFIED - Auto-verified)`);

    // Verify Double Ledger Entries (SALE + RECEIPT)
    const { data: ledger3 } = await supabase
      .from('transactions')
      .select('*')
      .eq('refId', res3.orderId);

    console.log(`   - Ledger Transactions created: ${ledger3?.length || 0} (Expected: 2)`);
    if (ledger3) {
      ledger3.forEach((tx) => {
        console.log(`     * Type: ${tx.type} | Debit: ₹${tx.debit} | Credit: ₹${tx.credit} | Verified: ${tx.isVerified}`);
      });
    }

    // ------------------------------------------------------------
    // TEST CASE 4: File Attachments & Workspace Logic
    // ------------------------------------------------------------
    console.log('\n------------------------------------------------------------');
    console.log('🧪 TEST CASE 4: File Attachments & Workspace Logic');
    console.log('------------------------------------------------------------');

    const { data: orderItem4 } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', res1.orderId)
      .single();

    if (!orderItem4) throw new Error('Order Item 4 not found');
    console.log(`   - Design Status: ${orderItem4.designStatus} (Expected: WAITING_FOR_DESIGNER)`);
    console.log(`   - Attached File URL: ${orderItem4.fileUrl} (Expected: https://example.com/artwork1.png)`);

  } catch (error: any) {
    console.error('❌ Regression check encountered error:', error.message);
    process.exitCode = 1;
  } finally {
    // Database Cleanup
    console.log('\n============================================================');
    console.log('🧹 DATABASE CLEANUP');
    console.log('============================================================');
    if (cleanupIds.length > 0) {
      console.log(`Removing ${cleanupIds.length} benchmark orders...`);
      await supabase.from('orders').delete().in('id', cleanupIds);
      await supabase.from('order_items').delete().in('order_id', cleanupIds);
      await supabase.from('transactions').delete().in('refId', cleanupIds);
      console.log('✨ Cleanup finished.');
    }

    // Restore customer credit profile
    await supabase
      .from('profiles')
      .update({ creditLimit: customer.creditLimit, usedCredit: customer.usedCredit })
      .eq('id', customer.id);
  }
}

runRegressionTests().catch(console.error);
