// scripts/test_rec_00036_xml.js
const { buildReceiptVoucherXML } = require('../tally-connector/xml-builder');

const payload = {
  tallyCompanyName: "Hindustan Enterprises 25-26",
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
  billAllocations: [
    {
      name: "INV-00047",
      billType: "Agst Ref",
      amount: 169.28,
    }
  ]
};

console.log('=== XML FOR REC-00036 ===');
console.log(buildReceiptVoucherXML(payload, false));
