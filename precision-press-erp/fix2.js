const fs = require('fs');
const path = 'src/lib/actions/accounts.ts';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `  // 2. Queue for Tally Push
  const { error: syncErr } = await supabaseServer.from('tally_sync_queue').insert({
    voucher_type: 'Contra',
    voucher_date: new Date().toISOString().split('T')[0],
    reference_id: contraId,
    status: 'PENDING',
    payload: {
      contraEntryNumber,
      transferType,
      totalAmount: amount,
      remarks,
      type: 'CONTRA'
    }
  });

  if (syncErr) {
    console.warn('[createContraEntry] Failed to enqueue Tally sync:', syncErr.message);
  }`;

const replaceStr = `  // 2. Queue for Tally Push
  try {
    const { enqueueTallySync } = await import('./tally-sync');
    await enqueueTallySync({
      syncType: 'CONTRA_VOUCHER',
      orderId: contraId,
      customerId: 'system',
      createdBy: authUser.id,
      voucherId: contraEntryNumber,
      voucherType: 'Contra',
      refId: contraEntryNumber,
      amountSnap: { amount, type: transferType },
      payload: {
        contraEntryNumber,
        voucherNumber: contraEntryNumber,
        transferType,
        amount: amount,
        remarks,
        voucherDate: contraDate || new Date().toISOString().split('T')[0],
        fromLedgerName: source_ledger,
        toLedgerName: target_ledger,
        type: 'CONTRA'
      }
    });
  } catch (syncErr: any) {
    console.warn('[createContraEntry] Failed to enqueue Tally sync:', syncErr.message);
  }`;

// Use CRLF because the file is likely CRLF
const targetCRLF = targetStr.replace(/\n/g, '\r\n');
const replaceCRLF = replaceStr.replace(/\n/g, '\r\n');

if (code.includes(targetCRLF)) {
  code = code.replace(targetCRLF, replaceCRLF);
  fs.writeFileSync(path, code);
  console.log('SUCCESS');
} else if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync(path, code);
  console.log('SUCCESS');
} else {
  console.log('NOT FOUND');
}
