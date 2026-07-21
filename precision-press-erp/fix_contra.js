const fs = require('fs');
const path = 'src/lib/actions/accounts.ts';
let code = fs.readFileSync(path, 'utf8');

const regex = /\/\/ 2\. Queue for Tally Push[\s\S]*?console\.warn\('\[createContraEntry\] Failed to enqueue Tally sync:', syncErr\.message\);\s*\}/;

const replacement = `  // 2. Queue for Tally Push
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

if (regex.test(code)) {
  fs.writeFileSync(path, code.replace(regex, replacement));
  console.log('SUCCESS_REPLACEMENT');
} else {
  console.log('REGEX_NOT_FOUND');
}
