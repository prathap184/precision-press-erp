// scripts/test_live_queue_xml.js
const { buildReceiptVoucherXML } = require('../tally-connector/xml-builder');

console.log('--- GENERATING XML FOR LATEST RECEIPTS IN QUEUE ---');

const adv02 = {
  amount: 100,
  remarks: "Advance Receipt ADV-0002",
  allocations: [],
  invoiceDate: "2026-08-31",
  paymentMode: "BANK",
  totalAmount: 100,
  voucherDate: "2026-08-31",
  customerName: "Festive Events- Mys- FTM- BO",
  voucherNumber: "ADV-0002",
  billAllocations: {
    name: "ADV-0002",
    amount: 100,
    billType: "Advance"
  },
  debtorLedgerName: "Festive Events- Mys- FTM- BO",
  receiptEntryNumber: "ADV-0002"
};

console.log('\n1. XML FOR ADV-0002 (Advance):');
console.log(buildReceiptVoucherXML(adv02, false));

const onAcct = {
  amount: 169.28,
  remarks: "Receipt for Order #6E0FF44B",
  allocations: [],
  invoiceDate: "2026-08-31",
  paymentMode: "CASH",
  cashLedger: "Cash B2 Drawer",
  totalAmount: 169.28,
  voucherDate: "2026-08-31",
  customerName: "Festive Events- Mys- FTM- BO",
  voucherNumber: "ADV-98A2F7",
  billAllocations: {
    name: "ADV-98A2F7",
    amount: 169.28,
    billType: "On Account"
  },
  debtorLedgerName: "Festive Events- Mys- FTM- BO",
  receiptEntryNumber: "ADV-98A2F7"
};

console.log('\n2. XML FOR ON-ACCOUNT RECEIPT:');
console.log(buildReceiptVoucherXML(onAcct, false));
