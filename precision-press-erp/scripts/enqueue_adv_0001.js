// scripts/enqueue_adv_0001.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [credit] = await sql`SELECT cc.*, c.name as customer_name FROM customer_credit cc JOIN contact c ON c.id = cc.contact_id WHERE cc.original_amount = 100000 LIMIT 1`;
  if (!credit) {
    console.log('No advance credit found in DB');
    return;
  }

  const receiptRef = 'ADV-0001';
  const receiptPayload = {
    receiptEntryNumber: receiptRef,
    voucherNumber: receiptRef,
    voucherDate: '2026-08-26',
    invoiceDate: '2026-08-26',
    totalAmount: 1000.0,
    amount: 1000.0,
    paymentMode: 'BANK',
    debtorLedgerName: credit.customer_name,
    customerName: credit.customer_name,
    remarks: 'Customer Receipt ADV-0001',
    allocations: [],
    billAllocations: {
      name: receiptRef,
      billType: 'Advance',
      amount: 1000.0,
    },
  };

  const idempotencyKey = `RECEIPT_VOUCHER::${receiptRef}`;
  const eventId = `TSYNC-R-1787726900000-ADV`;

  // Upsert into tally_sync_queue
  const { error } = await supabase.from('tally_sync_queue').upsert({
    id: eventId,
    syncType: 'RECEIPT_VOUCHER',
    paymentId: credit.id,
    customerId: credit.contact_id,
    idempotencyKey,
    payload: receiptPayload,
    status: 'PENDING',
    retryCount: 0,
    maxRetries: 3,
    createdBy: '00000000-0000-0000-0000-000000000001',
    createdAt: '2026-08-26T06:00:00.000Z', // Early timestamp so it syncs BEFORE the invoices!
    voucherId: receiptRef,
    voucherType: 'Receipt',
    refId: receiptRef,
    customerName: credit.customer_name,
    amountSnap: 1000.0,
  });

  if (error) {
    console.error('Error enqueueing ADV-0001:', error);
  } else {
    console.log('✅ Successfully enqueued ADV-0001 (Receipt Voucher) into tally_sync_queue with timestamp 2026-08-26!');
  }

  await sql.end();
}

run().catch(console.error);
