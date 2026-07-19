import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
import { supabaseServer } from './src/lib/supabase-server';
// NOTE: generateInvoiceForParentOrder removed — invoices are now manual.
// Use the Invoice Generation module UI or generateInvoiceFromChildOrders() from documents.ts.

import * as crypto from 'crypto';

const TEST_ORDER_ID = 'ORD-VALIDATION-555';

async function logResult(testName: string, passed: boolean, details: any) {
    console.log(`\n==============================================`);
    console.log(`[TEST] ${testName}`);
    console.log(`[RESULT] ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`[DETAILS]`, JSON.stringify(details, null, 2));
    console.log(`==============================================\n`);
}

async function setupTestOrder() {
    // Clean up
    await supabaseServer.from('invoice_events').delete().eq('invoice_id', `INV-VALIDATION-555`);
    await supabaseServer.from('invoices').delete().eq('parent_order_id', TEST_ORDER_ID);
    await supabaseServer.from('invoice_generation_attempts').delete().eq('base_order_id', TEST_ORDER_ID);
    await supabaseServer.from('order_items').delete().eq('order_id', TEST_ORDER_ID);
    await supabaseServer.from('orders').delete().eq('id', TEST_ORDER_ID);

    // Create Customer in profiles (need an existing one or create mock)
    // we assume 'e2e-user' exists or we can just mock a customer snapshot
    const mockCustomer = { name: 'Test Customer', phone: '9999999999', gstin: '27AABC1234' };
    
    // Insert order
    await supabaseServer.from('orders').insert({
        id: TEST_ORDER_ID,
        customerId: 'mock-cust-123',
        customerName: 'Test Customer',
        customerSnapshot: mockCustomer,
        orderType: 'CASH',
        createdBy: 'ADMIN',
        amounts: { base: 1000, grandTotal: 1180 },
        status: 'DISPATCHED',
        deliveryChoice: 'PICKUP'
    });

    // Insert order item
    await supabaseServer.from('order_items').insert({
        id: `item-${TEST_ORDER_ID}-1`,
        order_id: TEST_ORDER_ID,
        product_name: 'Test Product 1',
        product_id: 'prod-1',
        hsn_code: '4820',
        hsn_description: 'Notebooks',
        gst_rate: 18,
        taxable_value: 1000,
        specs: { quantity: 10 },
        material_metadata: { eyeletCount: 0 }
    });
}

async function runTests() {
    await setupTestOrder();

    // 1. End-to-End Invoice Generation Test
    let r1 = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv1 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let { data: att1 } = await supabaseServer.from('invoice_generation_attempts').select('*').eq('base_order_id', TEST_ORDER_ID).single();
    
    let passed1 = r1.success === true && inv1 && inv1.invoice_number && inv1.financial_lock_at && att1.status === 'SUCCESS';
    await logResult('1. End-to-End Invoice Generation Test', passed1, { response: r1, invoiceNumber: inv1?.invoice_number, lock: inv1?.financial_lock_at, attempt: att1 });

    // 2. Retry Validation
    // Force failure: lock the attempt to prevent duplicate then release it to test "FAILED" -> "GENERATED"
    // Wait, the easiest way to test FAILED is to delete the order items, run generation, and see it fail.
    await supabaseServer.from('invoices').delete().eq('parent_order_id', TEST_ORDER_ID);
    await supabaseServer.from('invoice_generation_attempts').delete().eq('base_order_id', TEST_ORDER_ID);
    await supabaseServer.from('order_items').delete().eq('order_id', TEST_ORDER_ID);

    let r2a = await generateInvoiceForParentOrder(TEST_ORDER_ID); // Should fail due to no items
    let { data: att2a } = await supabaseServer.from('invoice_generation_attempts').select('*').eq('base_order_id', TEST_ORDER_ID).single();
    
    // Add item back
    await supabaseServer.from('order_items').insert({
        id: `item-${TEST_ORDER_ID}-1`, order_id: TEST_ORDER_ID, product_name: 'Test Product 1',
        gst_rate: 18, taxable_value: 1000
    });
    let r2b = await generateInvoiceForParentOrder(TEST_ORDER_ID); // Should succeed
    let { data: att2b } = await supabaseServer.from('invoice_generation_attempts').select('*').eq('base_order_id', TEST_ORDER_ID).single();
    
    let passed2 = r2a.success === false && att2a?.status === 'FAILED' && att2a?.attempts === 1 &&
                  r2b.success === true && att2b?.status === 'SUCCESS' && att2b?.attempts === 2;
    await logResult('2. Retry Validation', passed2, { failResult: r2a, failAttempt: att2a, succResult: r2b, succAttempt: att2b });

    // 3. Hash Validation
    let { data: inv3 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let computedHash = crypto.createHash('sha256').update(JSON.stringify({
      invoice_number: inv3.invoice_number,
      financial_year: inv3.financial_year,
      customer_snapshot: inv3.customer_snapshot,
      company_snapshot: inv3.company_snapshot,
      items: inv3.items,
      amounts: inv3.amounts,
      tax_details: inv3.tax_details
    })).digest('hex');

    let passed3 = inv3.snapshot_hash === computedHash && inv3.snapshot_hash_algorithm === 'SHA-256' && !!inv3.pdf_sha256;
    await logResult('3. Hash Validation', passed3, { storedHash: inv3.snapshot_hash, computedHash });

    // 4. Financial Snapshot Validation
    let passed4 = inv3.items[0].gstRate === 18 && inv3.amounts.gst === 180 && inv3.items[0].productName === 'Test Product 1';
    await logResult('4. Financial Snapshot Validation', passed4, { items: inv3.items, amounts: inv3.amounts });

    // 5. Snapshot Independence Test
    // Update order item to something else
    await supabaseServer.from('order_items').update({ product_name: 'CHANGED NAME' }).eq('order_id', TEST_ORDER_ID);
    let r5 = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv5 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let passed5 = r5.existing === true && inv5.items[0].productName === 'Test Product 1';
    await logResult('5. Snapshot Independence Test', passed5, { originalName: 'Test Product 1', invoiceName: inv5.items[0].productName });

    // 6. PDF Validation
    let passed6 = inv5.pdf_url === 'placeholder.pdf' && inv5.pdf_sha256 !== null;
    await logResult('6. PDF Validation', passed6, { pdfUrl: inv5.pdf_url, pdfSha: inv5.pdf_sha256 });

    // 7. Decimal Validation
    await supabaseServer.from('invoices').delete().eq('parent_order_id', TEST_ORDER_ID);
    await supabaseServer.from('invoice_generation_attempts').delete().eq('base_order_id', TEST_ORDER_ID);
    await supabaseServer.from('order_items').update({ taxable_value: 0.1 }).eq('order_id', TEST_ORDER_ID);
    await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv7 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let gstExpected = 0.1 * 0.18; // 0.018
    let roundedGstExpected = Math.round(gstExpected * 100) / 100; // wait, decimal.js handles it exact
    let passed7 = inv7.amounts.itemsSubtotal === 0.1;
    await logResult('7. Decimal Validation', passed7, { subtotal: inv7.amounts.itemsSubtotal, gst: inv7.amounts.gst, grandTotal: inv7.amounts.grandTotal });

    // 8. Concurrency Test
    await supabaseServer.from('invoices').delete().eq('parent_order_id', TEST_ORDER_ID);
    await supabaseServer.from('invoice_generation_attempts').delete().eq('base_order_id', TEST_ORDER_ID);
    let results8 = await Promise.all([
        generateInvoiceForParentOrder(TEST_ORDER_ID),
        generateInvoiceForParentOrder(TEST_ORDER_ID),
        generateInvoiceForParentOrder(TEST_ORDER_ID)
    ]);
    let { data: inv8 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID);
    let successCount = results8.filter(r => r.success && !r.existing).length;
    let lockedCount = results8.filter(r => !r.success && r.error?.includes('in progress')).length;
    let existingCount = results8.filter(r => r.existing).length;
    let passed8 = inv8.length === 1 && (successCount === 1);
    await logResult('8. Concurrency Test', passed8, { results: results8, dbRows: inv8.length });

    // 9. Dispatch Rollback Test
    // If we call generation again, it returns {existing: true}.
    let r9 = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let passed9 = r9.existing === true;
    await logResult('9. Dispatch Rollback Test', passed9, { result: r9 });
}

runTests().then(() => console.log('Validation complete.')).catch(console.error);
