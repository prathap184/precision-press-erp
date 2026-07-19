"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const firebase_admin_1 = require("./src/lib/firebase-admin");
const supabase_server_1 = require("./src/lib/supabase-server");
const workflow_1 = require("./src/lib/workflow");
// Minimal mock user
const MOCK_USER = { id: 'SYSTEM_ADMIN', name: 'System Admin', role: 'ADMIN' };
async function resetOrder(orderId, status) {
    await firebase_admin_1.adminDb.collection('orders').doc(orderId).update({ status });
}
async function logTest(name, fn) {
    try {
        const passed = await fn();
        console.log(`[TEST] ${name} -> ${passed ? 'âœ… PASSED' : 'âŒ FAILED'}`);
    }
    catch (e) {
        console.log(`[TEST] ${name} -> âŒ FAILED with Error: ${e.message}`);
    }
}
async function runTests() {
    console.log('--- Phase 6 Final Verification ---\n');
    const testOrderId = `ORD-DISPATCH-${Date.now()}`;
    const testCustomerId = `CUST-DISPATCH-${Date.now()}`;
    // Setup dummy order
    await firebase_admin_1.adminDb.collection('orders').doc(testOrderId).set({
        customerId: testCustomerId,
        status: 'PLACED',
        orderType: 'CASH',
        workflow: {},
        baseOrderId: null,
        taxable_value: 1000,
        cgst_amount: 90,
        sgst_amount: 90,
        igst_amount: 0,
        grand_total: 1180,
    });
    let firstInvoiceId = '';
    let firstInvoiceNumber = '';
    await logTest('Scenario 1: PLACED â†’ DISPATCHED generates invoice', async () => {
        // Transition to DISPATCHED
        await (0, workflow_1.transitionOrder)(testOrderId, 'DISPATCHED', 'Test Dispatch 1', MOCK_USER);
        // Wait for background logic (since workflow.ts does it inline async)
        await new Promise(r => setTimeout(r, 2000));
        const { data: invs } = await supabase_server_1.supabaseServer.from('invoices').select('*').eq('parent_order_id', testOrderId);
        if (!invs || invs.length !== 1)
            return false;
        firstInvoiceId = invs[0].id;
        firstInvoiceNumber = invs[0].invoice_number;
        return !!firstInvoiceNumber;
    });
    await logTest('Scenario 2: DISPATCHED â†’ DISPATCHED (no new invoice)', async () => {
        // Mock UI updating dispatch fields while still in DISPATCHED status
        await (0, workflow_1.transitionOrder)(testOrderId, 'DISPATCHED', 'Test Dispatch 2', MOCK_USER);
        await new Promise(r => setTimeout(r, 2000));
        const { data: invs } = await supabase_server_1.supabaseServer.from('invoices').select('*').eq('parent_order_id', testOrderId);
        return invs?.length === 1 && invs[0].invoice_number === firstInvoiceNumber;
    });
    await logTest('Scenario 3: DISPATCHED â†’ IN_PROGRESS â†’ DISPATCHED (no new invoice)', async () => {
        await resetOrder(testOrderId, 'IN_PROGRESS');
        await (0, workflow_1.transitionOrder)(testOrderId, 'DISPATCHED', 'Test Dispatch 3', MOCK_USER);
        await new Promise(r => setTimeout(r, 2000));
        const { data: invs } = await supabase_server_1.supabaseServer.from('invoices').select('*').eq('parent_order_id', testOrderId);
        return invs?.length === 1 && invs[0].invoice_number === firstInvoiceNumber;
    });
    await logTest('Scenario 4: DISPATCH_ROLLED_BACK â†’ DISPATCHED (reuse existing row & number)', async () => {
        // Rollback
        await supabase_server_1.supabaseServer.from('invoices').update({ status: 'DISPATCH_ROLLED_BACK' }).eq('parent_order_id', testOrderId);
        await resetOrder(testOrderId, 'IN_PROGRESS');
        // Redispatch
        await (0, workflow_1.transitionOrder)(testOrderId, 'DISPATCHED', 'Test Dispatch 4', MOCK_USER);
        await new Promise(r => setTimeout(r, 2000));
        const { data: invs } = await supabase_server_1.supabaseServer.from('invoices').select('*').eq('parent_order_id', testOrderId);
        // It should have reused the SAME row and SAME number, status now PENDING or GENERATING
        return invs?.length === 1 && invs[0].invoice_number === firstInvoiceNumber && invs[0].status !== 'DISPATCH_ROLLED_BACK';
    });
    console.log('\n--- Atomic Dispatch Analysis ---');
    console.log('Validating Atomicity: orderRef.update() and generateInvoiceForParentOrder() are executed via separate DB connections.');
    console.log('Result: The operations are currently sequenced in Node.js rather than executing in a true single Postgres transaction.');
    console.log('Recommendation: To achieve 100% atomicity, we must use an RPC function to transition order status and reserve the invoice number simultaneously, or use an Outbox Pattern.');
    // Cleanup
    await firebase_admin_1.adminDb.collection('orders').doc(testOrderId).delete();
    await supabase_server_1.supabaseServer.from('invoices').delete().eq('parent_order_id', testOrderId);
}
runTests().then(() => process.exit(0)).catch(() => process.exit(1));

