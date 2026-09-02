// scripts/check_queue_for_rec_00036.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('tally_sync_queue')
    .select('*')
    .or(`refId.eq.REC-00036,paymentId.eq.0bf41af7-e54d-48dc-a83c-9a647b3d76cf,voucherId.eq.REC-00036`);

  console.log('Queue search result:', data);

  if (!data || data.length === 0) {
    console.log('Not in queue yet! Enqueuing REC-00036 now...');
    const receiptPayload = {
      tallyCompanyName: process.env.TALLY_COMPANY_NAME || "Website Testing Hindustan",
      voucherType: "Rec1 B1 Bank",
      receiptEntryNumber: "REC-00036",
      voucherNumber: "REC-00036",
      voucherDate: "2026-08-31",
      invoiceDate: "2026-08-31",
      date: "2026-08-31",
      totalAmount: 169.28,
      amount: 169.28,
      paymentMode: "BANK",
      bankLedger: "Rec1 B1 Bank",
      cashLedger: "Cash",
      debtorLedgerName: "Festive Events- Mys- FTM- BO",
      customerName: "Festive Events- Mys- FTM- BO",
      remarks: "Receipt REC-00036 against INV-00047",
      allocations: [
        {
          invoiceNumber: "INV-00047",
          billType: "Agst Ref",
          amount: 169.28,
        }
      ],
      billAllocations: [
        {
          name: "INV-00047",
          billType: "Agst Ref",
          amount: 169.28,
        }
      ]
    };

    const eventId = `TSYNC-R-${Date.now()}-REC36`;
    const { error: insErr } = await supabase.from('tally_sync_queue').insert({
      id: eventId,
      syncType: 'RECEIPT_VOUCHER',
      paymentId: '0bf41af7-e54d-48dc-a83c-9a647b3d76cf',
      customerId: 'adb16875-70de-43f2-9116-7f8167f3ea4a',
      payload: receiptPayload,
      status: 'PENDING',
      voucherId: 'REC-00036',
      voucherType: 'Receipt',
      refId: 'REC-00036',
      customerName: 'Festive Events- Mys- FTM- BO',
      amountSnap: 169.28,
    });

    if (insErr) {
      console.error('Insert error:', insErr);
    } else {
      console.log('✅ Successfully enqueued REC-00036 to tally_sync_queue!');
    }
  }
}

check().catch(console.error);
