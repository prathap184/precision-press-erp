// scripts/test_xml_generation.js
const { buildSalesInvoiceXML, buildReceiptVoucherXML } = require('../tally-connector/xml-builder');

console.log('====================================================');
console.log('1. TESTING ADV-0001 RECEIPT VOUCHER XML GENERATION:');
console.log('====================================================');

const receiptPayload = {
  tallyCompanyName: process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan',
  voucherType: 'Rec1 B1 Bank',
  voucherNumber: 'ADV-0001',
  receiptEntryNumber: 'ADV-0001',
  voucherDate: '2026-08-26',
  totalAmount: 1000,
  paymentMode: 'BANK',
  bankLedger: 'Rec1 B1 Bank',
  debtorLedgerName: 'Festive Events- Mys- FTM- BO',
  customerName: 'Festive Events- Mys- FTM- BO',
  remarks: 'Customer Receipt ADV-0001',
  billAllocations: {
    name: 'ADV-0001',
    billType: 'Advance',
    amount: 1000,
  },
};

const receiptXml = buildReceiptVoucherXML(receiptPayload, false);
console.log(receiptXml);

console.log('\n====================================================');
console.log('2. TESTING INV-00045 AGST REF SALES INVOICE XML:');
console.log('====================================================');

const invoicePayload = {
  targetCompany: process.env.TALLY_COMPANY_NAME || 'Website Testing Hindustan',
  voucherType: '1.GST HO CS',
  invoiceNumber: 'INV-00045',
  voucherDate: '2026-08-30',
  debtorLedgerName: 'Festive Events- Mys- FTM- BO',
  state: 'Karnataka',
  commonGodown: 'B1',
  grandTotal: 564.28,
  cgst: 43.04,
  sgst: 43.04,
  billAllocations: {
    name: 'ADV-0001',
    billType: 'Agst Ref',
    amount: -564.28,
  },
  items: [
    {
      productName: 'Vinyl Printing',
      hsnCode: '32141000',
      quantity: 1,
      unit: 'N',
      rate: 478.20,
      taxableAmount: 478.20,
      godownName: 'B1',
    },
  ],
};

const invoiceXml = buildSalesInvoiceXML(invoicePayload, false);
console.log(invoiceXml);
