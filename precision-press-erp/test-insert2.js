require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('payments').insert({
      id: 'PAY-TEST-' + Date.now(),
      orderId: 'ORD-TEST',
      userId: 'test',
      customerName: 'Test Customer',
      paymentMode: 'CASH',
      amount: 100,
      ourBankAccount: 'HAND CASH',
      depositDate: '2026-06-23',
      depositBank: 'hand cash',
      branchName: 'ACDEMA',
      proofDriveLink: 'NOT required',
      remarks: 'Test',
      depositRefNo: '123',
      status: 'APPROVED',
      approvedBy: 'test',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByRole: 'ACDEMA',
      orderIds: ['ORD-TEST'],
      is_synced_to_erp: false
  });
  console.log('Error:', error);
}
run();
