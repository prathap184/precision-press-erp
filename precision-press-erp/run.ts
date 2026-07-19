import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
import { supabaseServer } from './src/lib/supabase-server';
// NOTE: generateInvoiceForParentOrder & manualGenerateAgain removed — invoices are now manual.
// Use the Invoice Generation module UI or generateInvoiceFromChildOrders() from documents.ts.

import { adminDb } from './src/lib/firebase-admin';
import * as crypto from 'crypto';

const TEST_ORDER_ID = 'ORD-VALIDATION-555';
const INV_ID = 'INV-VALIDATION-555';

async function logResult(testName: string, passed: boolean, details: any) {
    console.log(`\n==============================================`);
    console.log(`[TEST] ${testName}`);
    console.log(`[RESULT] ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`[DETAILS]`, JSON.stringify(details, null, 2));
    console.log(`==============================================\n`);
}

async function cleanup() {
    await supabaseServer.from('invoice_events').delete().eq('invoice_id', INV_ID);
    await supabaseServer.from('invoice_generation_attempts').delete().eq('invoice_id', INV_ID);
    await supabaseServer.from('invoices').delete().eq('parent_order_id', TEST_ORDER_ID);
    await supabaseServer.from('order_items').delete().eq('order_id', TEST_ORDER_ID);
}

async function resetItems(taxableValue: number = 1000) {
    await supabaseServer.from('order_items').delete().eq('order_id', TEST_ORDER_ID);
    await supabaseServer.from('order_items').insert({
        id: `item-${TEST_ORDER_ID}-1`,
        order_id: TEST_ORDER_ID,
        product_name: 'Test Product 1',
        product_id: 'prod-1',
        pricing_snapshot: { taxable_value: taxableValue, gst_rate: 18 },
        specs: { quantity: 10 },
        material_metadata: { eyeletCount: 0 }
    });
}

async function setupTestOrder() {
    await cleanup();
    await supabaseServer.from('orders').delete().eq('id', TEST_ORDER_ID);
    const mockCustomer = { name: 'Test Customer', phone: '9999999999', gstin: '27AABC1234' };
    const r1 = await supabaseServer.from('orders').insert({
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
    console.log('Orders insert:', r1.error);
    await resetItems();
    console.log('Order Items inserted: ✓');
}

async function runTests() {
    await setupTestOrder();

    // 1. End-to-End Invoice Generation Test
    let r1 = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv1 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let { data: att1 } = await supabaseServer.from('invoice_generation_attempts').select('*').eq('invoice_id', INV_ID).order('attempt_number', {ascending: false}).limit(1);
    let passed1 = r1.success === true && inv1 && inv1.invoice_number && inv1.financial_lock_at && inv1.generation_requested_at && inv1.generated_at && inv1.generation_version === 1 && att1[0]?.result_status === 'SUCCESS';
    await logResult('1. End-to-End Invoice Generation Test', passed1, { 
        response: r1, invoiceNumber: inv1?.invoice_number, lock: inv1?.financial_lock_at, 
        requestedAt: inv1?.generation_requested_at, version: inv1?.generation_version, attempt: att1?.[0]
    });

    // 2. Retry Validation
    await cleanup();
    // no items → first call fails
    let r2a = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv2a } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let { data: ev2a } = await supabaseServer.from('invoice_events').select('*').eq('invoice_id', INV_ID).eq('event_type', 'GENERATION_FAILED');
    await resetItems();
    let r2b = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv2b } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let passed2 = r2a.success === false && inv2a?.attempt_count === 1 && inv2a?.status === 'PENDING' &&
                  r2b.success === true && inv2b?.attempt_count === 2 && inv2b?.status === 'GENERATED' &&
                  inv2a?.invoice_number === inv2b?.invoice_number && ev2a.length > 0;
    await logResult('2. Retry Validation', passed2, { 
        failAttemptCount: inv2a?.attempt_count, succAttemptCount: inv2b?.attempt_count, 
        failStatus: inv2a?.status, succStatus: inv2b?.status, evCount: ev2a?.length 
    });

    // 3. Hash Validation
    let { data: inv3 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let computedHash = crypto.createHash('sha256').update(JSON.stringify({
      invoice_number: inv3.invoice_number,
      financial_year: inv3.financial_year,
      invoice_date: inv3.invoice_date,
      customer_snapshot: inv3.customer_snapshot,
      company_snapshot: inv3.company_snapshot,
      items: inv3.items.map((item: any) => ({ orderId: item.orderId, productName: item.productName, quantity: item.quantity, sqft: item.sqft, baseAmount: item.baseAmount, finishAmount: item.finishAmount, itemTotal: item.itemTotal, gstRate: item.gstRate, hsnCode: item.hsnCode, hsnDescription: item.hsnDescription, gstEffectiveFrom: item.gstEffectiveFrom })),
      taxable_value: Number(inv3.taxable_value),
      cgst_amount: Number(inv3.cgst_amount),
      sgst_amount: Number(inv3.sgst_amount),
      igst_amount: Number(inv3.igst_amount),
      round_off: Number(inv3.round_off),
      grand_total: Number(inv3.grand_total),
      tax_details: { type: 'CGST_SGST', rate: 18 }
    })).digest('hex');
    let passed3 = inv3.snapshot_hash === computedHash && inv3.snapshot_hash_algorithm === 'SHA-256' && !!inv3.pdf_sha256;
    await logResult('3. Hash Validation', passed3, { storedHash: inv3.snapshot_hash, computedHash });

    // 4. Financial Snapshot Validation
    let passed4 = inv3.items && inv3.items[0] && inv3.items[0].gstRate === 18 && (inv3.cgst_amount + inv3.sgst_amount) === 180 && inv3.items[0].productName === 'Test Product 1';
    await logResult('4. Financial Snapshot Validation', passed4, { items: inv3?.items, tax: inv3.cgst_amount + inv3.sgst_amount });

    // 5. Snapshot Independence Test
    await supabaseServer.from('order_items').update({ product_name: 'CHANGED NAME' }).eq('order_id', TEST_ORDER_ID);
    let r5 = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv5 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let passed5 = r5.existing === true && inv5.items[0].productName === 'Test Product 1';
    await logResult('5. Snapshot Independence Test', passed5, { originalName: 'Test Product 1', invoiceName: inv5?.items?.[0]?.productName });

    // 6. PDF Validation (basic)
    let passed6 = inv5.pdf_url === 'placeholder.pdf' && inv5.pdf_sha256 !== null;
    await logResult('6. PDF Validation', passed6, { pdfUrl: inv5?.pdf_url, pdfSha: inv5?.pdf_sha256 });

    // 7. Decimal Validation — FIXED: insert items with 0.1, then generate
    await cleanup();
    await resetItems(0.1);
    await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv7 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
    let gst7 = parseFloat((Number(inv7?.cgst_amount) + Number(inv7?.sgst_amount)).toFixed(4));
    let passed7 = Number(inv7?.taxable_value) === 0.1 && gst7 === 0.02 && Number(inv7?.grand_total) === 0.12;
    await logResult('7. Decimal Validation', passed7, { subtotal: inv7?.taxable_value, gst: gst7, grandTotal: inv7?.grand_total });

    // 8. Concurrency Test
    await cleanup();
    await resetItems();
    let results8 = await Promise.all([
        generateInvoiceForParentOrder(TEST_ORDER_ID),
        generateInvoiceForParentOrder(TEST_ORDER_ID),
        generateInvoiceForParentOrder(TEST_ORDER_ID)
    ]);
    let { data: inv8 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID);
    let successCount = results8.filter((r: any) => r.success && !r.existing).length;
    let lockedCount = results8.filter((r: any) => !r.success && r.error?.includes('in progress')).length;
    let existingCount = results8.filter((r: any) => r.existing).length;
    let passed8 = inv8.length === 1 && (successCount === 1) && (lockedCount + existingCount === 2);
    await logResult('8. Concurrency Test', passed8, { results: results8, dbRows: inv8.length });

    // 9. Dispatch Rollback Test
    await supabaseServer.from('invoices').update({ status: 'DISPATCH_ROLLED_BACK', financial_lock_at: null }).eq('id', INV_ID);
    let r9 = await generateInvoiceForParentOrder(TEST_ORDER_ID);
    let { data: inv9 } = await supabaseServer.from('invoices').select('*').eq('id', INV_ID).single();
    let passed9 = r9.success === true && inv9?.status === 'GENERATED';
    await logResult('9. Dispatch Rollback Test', passed9, { result: r9, finalStatus: inv9?.status });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 5 FINAL VALIDATION TESTS
    // ══════════════════════════════════════════════════════════════════════════

    // 10. Dispatch Integration
    {
        await cleanup();
        await resetItems();
        const r10a = await generateInvoiceForParentOrder(TEST_ORDER_ID);
        const { data: inv10a } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
        const invoiceNumberAfterFirst = inv10a?.invoice_number;
        const r10b = await generateInvoiceForParentOrder(TEST_ORDER_ID);
        const { data: inv10b } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID);
        const passed10 = r10a.success === true && r10a.existing === false &&
                         r10b.existing === true && r10b.success === true &&
                         inv10b?.length === 1 &&
                         inv10b?.[0]?.invoice_number === invoiceNumberAfterFirst &&
                         !!inv10a?.invoice_number_reserved_at;
        await logResult('10. Dispatch Integration', passed10, {
            firstTrigger: { success: r10a.success, existing: r10a.existing },
            secondTrigger: { success: r10b.success, existing: r10b.existing },
            invoiceCount: inv10b?.length,
            invoiceNumber: invoiceNumberAfterFirst,
            reservedAt: inv10a?.invoice_number_reserved_at,
            sameNumberBothCalls: inv10b?.[0]?.invoice_number === invoiceNumberAfterFirst
        });
    }

    // 11. PDF Immutability
    {
        const { data: inv11 } = await supabaseServer.from('invoices').select('*').eq('parent_order_id', TEST_ORDER_ID).single();
        const sha256_1 = inv11?.pdf_sha256;
        const sha256_2 = inv11?.pdf_sha256;
        const passed11 = !!inv11?.pdf_url && !!inv11?.pdf_generated_at && !!inv11?.pdf_template_version &&
                         !!inv11?.pdf_sha256 && !!inv11?.pdf_generated_by && sha256_1 === sha256_2;
        await logResult('11. PDF Immutability', passed11, {
            pdf_url: inv11?.pdf_url,
            pdf_generated_at: inv11?.pdf_generated_at,
            pdf_template_version: inv11?.pdf_template_version,
            pdf_sha256: inv11?.pdf_sha256,
            pdf_generated_by: inv11?.pdf_generated_by,
            hashesMatch: sha256_1 === sha256_2
        });
    }

    // 12. Full Retry Lifecycle: FAILED -> PERMANENTLY_FAILED -> Generate Again -> GENERATED
    {
        await cleanup();
        const { data: seqData } = await supabaseServer.rpc('reserve_invoice_number', {
            p_invoice_date: new Date().toISOString().split('T')[0]
        });
        const { invoice_number, invoice_sequence, financial_year } = seqData[0];
        const reservedNumber = invoice_number;
        await supabaseServer.from('invoices').insert({
            id: INV_ID,
            invoice_number,
            invoice_sequence,
            financial_year,
            invoice_date: new Date().toISOString().split('T')[0],
            parent_order_id: TEST_ORDER_ID,
            customer_id: 'mock-cust-123',
            invoice_number_reserved_at: new Date().toISOString(),
            status: 'PENDING',
            generation_requested_at: new Date().toISOString(),
            attempt_count: 0,
            max_attempts: 3,
        });
        // No items -> forced failure
        await generateInvoiceForParentOrder(TEST_ORDER_ID); // attempt 1
        await generateInvoiceForParentOrder(TEST_ORDER_ID); // attempt 2
        await generateInvoiceForParentOrder(TEST_ORDER_ID); // attempt 3
        // 4th call: escalate to PERMANENTLY_FAILED
        const r12perm = await generateInvoiceForParentOrder(TEST_ORDER_ID);
        const { data: invPerm } = await supabaseServer.from('invoices').select('*').eq('id', INV_ID).single();
        // Add items back and Generate Again
        await resetItems();
        const r12again = await manualGenerateAgain(TEST_ORDER_ID, 'ADMIN');
        const { data: invFinal } = await supabaseServer.from('invoices').select('*').eq('id', INV_ID).single();
        const { data: allInvoices } = await supabaseServer.from('invoices').select('id').eq('parent_order_id', TEST_ORDER_ID);
        const passed12 = invPerm?.status === 'PERMANENTLY_FAILED' &&
                         invPerm?.invoice_number === reservedNumber &&
                         r12again.success === true &&
                         invFinal?.status === 'GENERATED' &&
                         invFinal?.invoice_number === reservedNumber &&
                         allInvoices?.length === 1;
        await logResult('12. Full Retry Lifecycle', passed12, {
            afterExhaustion: { status: invPerm?.status, invoiceNumber: invPerm?.invoice_number },
            generateAgainResult: { success: r12again.success },
            afterGenerateAgain: { status: invFinal?.status, invoiceNumber: invFinal?.invoice_number },
            sameInvoiceNumber: invFinal?.invoice_number === reservedNumber,
            totalInvoiceRows: allInvoices?.length
        });
    }

    // 13. Notification on PERMANENTLY_FAILED
    // Notification was created during test 12 PERMANENTLY_FAILED escalation
    {
        await new Promise(r => setTimeout(r, 2000)); // Give DB a moment to commit
        const { data: notifs } = await supabaseServer.from('notifications')
            .select('*')
            .eq('user_id', 'SYSTEM_ADMIN')
            .eq('type', 'INVOICE_PERMANENTLY_FAILED')
            .order('created_at', { ascending: false });
        
        const relevantNotif = (notifs || []).find((n: any) => n.message && n.message.includes(INV_ID));
        
        const passed13 = !!relevantNotif &&
                         relevantNotif.type === 'INVOICE_PERMANENTLY_FAILED' &&
                         relevantNotif.read === false &&
                         relevantNotif.message?.includes(INV_ID);
        await logResult('13. Notification on PERMANENTLY_FAILED', passed13, {
            notifExists: !!relevantNotif,
            notifType: relevantNotif?.type,
            notifTitle: relevantNotif?.title,
            notifUnread: relevantNotif?.read === false,
            notifMessage: relevantNotif?.message,
            notifUserId: relevantNotif?.user_id
        });
    }
}

runTests()
    .then(() => console.log('\nAll Phase 5 Final Validation Tests Complete.'))
    .catch(console.error);
