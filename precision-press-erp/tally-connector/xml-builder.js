'use strict';

/**
 * Utility to escape XML characters
 */
function xmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalizes a date to Tally's expected format YYYYMMDD
 */
function toTallyDate(dateStr, educationalMode = true) {
  let tallyDate;
  if (!dateStr || dateStr === 'undefined' || dateStr === 'null') {
    tallyDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  } else if (String(dateStr).length === 8 && !isNaN(Number(dateStr))) {
    tallyDate = String(dateStr);
  } else {
    try {
      tallyDate = new Date(dateStr).toISOString().slice(0, 10).replace(/-/g, '');
    } catch (e) {
      tallyDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    }
  }

  // Educational Mode: Tally's trial copy only accepts the 1st, 2nd, and 31st.
  if (educationalMode) {
    tallyDate = tallyDate.substring(0, 6) + '01';
  }

  return tallyDate;
}

/**
 * Generates a Sales Voucher (Invoice) XML
 */
function buildSalesInvoiceXML(payload, options = {}) {
  const educationalMode = typeof options === 'boolean' ? options : (options.educationalMode !== undefined ? options.educationalMode : true);
  const targetCompany = (typeof options === 'object' && options.companyName)
    ? options.companyName
    : (process.env.TALLY_COMPANY_NAME || ((payload.tallyCompanyName && payload.tallyCompanyName !== 'Auravionx') ? payload.tallyCompanyName : 'Website Testing Hindustan'));

  let {
    invoiceNumber,
    invoiceDate,
    customerName,
    items = [],
    subTotal,
    cgst,
    sgst,
    igst,
    grandTotal,
    debtorLedgerName,
  } = payload;

  const salesLedgerName = payload.ledgers?.salesLedger || payload.salesLedgerName || 'GST SALES';
  debtorLedgerName = payload.partyLedgerName || debtorLedgerName || customerName || 'Sundry Debtors';
  if (!invoiceNumber) invoiceNumber = `INV-${Date.now()}`;
  
  const tallyDate = toTallyDate(invoiceDate, educationalMode);
  const state = payload.placeOfSupply || payload.state || 'Karnataka';
  const narration = payload.narration || `Sales Invoice ${invoiceNumber}`;
  const commonGodown = payload.commonGodown || 'B1';

  // Calculate item entries
  const itemEntries = items.map(item => {
    const qty     = Number(item.quantity) || Number(item.sqft) || 1;
    const rate    = Number(item.rate) || 0;
    const amount  = Number(item.taxableAmount ?? item.amount ?? (rate * qty));
    const unit    = item.unit || 'N';
    const godown  = item.godownName || commonGodown || 'B1';
    const hsnTag  = item.hsnCode ? `<GSTHSNNAME>${xmlEscape(item.hsnCode)}</GSTHSNNAME>` : '';

    const width   = Number(item.width) || null;
    const length  = Number(item.length) || null;
    const sqft    = Number(item.sqft) || (width && length ? width * length : null);
    const sqftRate = Number(item.sqftRate) || (sqft ? (amount / (qty * sqft)) : rate);
    const ratePerPiece = Number(item.ratePer) || (sqft && sqftRate ? (sqft * sqftRate) : rate);
    const widthUnit = item.widthUnit || 'F';
    const lengthUnit = item.lengthUnit || 'F';

    let udfTags = '';
    let batchUdfTags = '';

    if (width != null && length != null && width > 0 && length > 0) {
      // MODE A: Custom Print / Raw Material Cutting with Dimensions
      udfTags = `
<UDF:VCHLENGTHUDF.LIST DESC="\`VchLengthUDF\`" ISLIST="YES" TYPE="Number" INDEX="1501">
 <UDF:VCHLENGTHUDF DESC="\`VchLengthUDF\`"> ${length}</UDF:VCHLENGTHUDF>
</UDF:VCHLENGTHUDF.LIST>
<UDF:VCHWIDTHUDF.LIST DESC="\`VchWidthUDF\`" ISLIST="YES" TYPE="Number" INDEX="1502">
 <UDF:VCHWIDTHUDF DESC="\`VchWidthUDF\`"> ${width}</UDF:VCHWIDTHUDF>
</UDF:VCHWIDTHUDF.LIST>
<UDF:VCHITEMSQFTRATEUDF.LIST DESC="\`VchItemSqFtRateUDF\`" ISLIST="YES" TYPE="Number" INDEX="1505">
 <UDF:VCHITEMSQFTRATEUDF DESC="\`VchItemSqFtRateUDF\`"> ${sqftRate.toFixed(2)}</UDF:VCHITEMSQFTRATEUDF>
</UDF:VCHITEMSQFTRATEUDF.LIST>
<UDF:VCHITEMAREAUDF.LIST DESC="\`VchItemAreaUDF\`" ISLIST="YES" TYPE="Number" INDEX="1506">
 <UDF:VCHITEMAREAUDF DESC="\`VchItemAreaUDF\`"> ${sqft}</UDF:VCHITEMAREAUDF>
</UDF:VCHITEMAREAUDF.LIST>
<UDF:VCHLENGTHUNITUDF.LIST DESC="\`VchLengthUnitUDF\`" ISLIST="YES" TYPE="String" INDEX="1503">
 <UDF:VCHLENGTHUNITUDF DESC="\`VchLengthUnitUDF\`">${lengthUnit}</UDF:VCHLENGTHUNITUDF>
</UDF:VCHLENGTHUNITUDF.LIST>
<UDF:VCHWIDTHUNITUDF.LIST DESC="\`VchWidthUnitUDF\`" ISLIST="YES" TYPE="String" INDEX="1504">
 <UDF:VCHWIDTHUNITUDF DESC="\`VchWidthUnitUDF\`">${widthUnit}</UDF:VCHWIDTHUNITUDF>
</UDF:VCHWIDTHUNITUDF.LIST>
<UDF:VCHITEMSIZESBILLINGTYPE.LIST DESC="\`VchItemSizesBillingType\`" ISLIST="YES" TYPE="String" INDEX="6556">
 <UDF:VCHITEMSIZESBILLINGTYPE DESC="\`VchItemSizesBillingType\`">A</UDF:VCHITEMSIZESBILLINGTYPE>
</UDF:VCHITEMSIZESBILLINGTYPE.LIST>`;

      batchUdfTags = `
<UDF:BATCHVCHLENGTHUDF.LIST DESC="\`BatchVchLengthUDF\`" ISLIST="YES" TYPE="Number" INDEX="1507">
 <UDF:BATCHVCHLENGTHUDF DESC="\`BatchVchLengthUDF\`"> ${length}</UDF:BATCHVCHLENGTHUDF>
</UDF:BATCHVCHLENGTHUDF.LIST>
<UDF:BATCHVCHWIDTHUDF.LIST DESC="\`BatchVchWidthUDF\`" ISLIST="YES" TYPE="Number" INDEX="1508">
 <UDF:BATCHVCHWIDTHUDF DESC="\`BatchVchWidthUDF\`"> ${width}</UDF:BATCHVCHWIDTHUDF>
</UDF:BATCHVCHWIDTHUDF.LIST>
<UDF:BATCHVCHITEMAREAUDF.LIST DESC="\`BatchVchItemAreaUDF\`" ISLIST="YES" TYPE="Number" INDEX="1511">
 <UDF:BATCHVCHITEMAREAUDF DESC="\`BatchVchItemAreaUDF\`"> ${sqft}</UDF:BATCHVCHITEMAREAUDF>
</UDF:BATCHVCHITEMAREAUDF.LIST>
<UDF:BATCHVCHLENGTHUNITUDF.LIST DESC="\`BatchVchLengthUnitUDF\`" ISLIST="YES" TYPE="String" INDEX="1509">
 <UDF:BATCHVCHLENGTHUNITUDF DESC="\`BatchVchLengthUnitUDF\`">${lengthUnit}</UDF:BATCHVCHLENGTHUNITUDF>
</UDF:BATCHVCHLENGTHUNITUDF.LIST>
<UDF:BATCHVCHWIDTHUNITUDF.LIST DESC="\`BatchVchWidthUnitUDF\`" ISLIST="YES" TYPE="String" INDEX="1510">
 <UDF:BATCHVCHWIDTHUNITUDF DESC="\`BatchVchWidthUnitUDF\`">${widthUnit}</UDF:BATCHVCHWIDTHUNITUDF>
</UDF:BATCHVCHWIDTHUNITUDF.LIST>`;
    } else {
      // MODE B: Direct Selling / Ready Goods / Off-The-Shelf Retail (Cable Ties, Tapes, etc.)
      udfTags = `
<UDF:VCHITEMSIZESBILLINGTYPE.LIST DESC="\`VchItemSizesBillingType\`" ISLIST="YES" TYPE="String" INDEX="6556">
 <UDF:VCHITEMSIZESBILLINGTYPE DESC="\`VchItemSizesBillingType\`">B</UDF:VCHITEMSIZESBILLINGTYPE>
</UDF:VCHITEMSIZESBILLINGTYPE.LIST>`;
    }

    return `
<ALLINVENTORYENTRIES.LIST>
<STOCKITEMNAME>${xmlEscape(item.productName)}</STOCKITEMNAME>
${hsnTag}
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<RATE>${ratePerPiece.toFixed(2)}/${unit}</RATE>
<AMOUNT>${amount.toFixed(2)}</AMOUNT>
<ACTUALQTY> ${qty.toFixed(2)} ${unit}</ACTUALQTY>
<BILLEDQTY> ${qty.toFixed(2)} ${unit}</BILLEDQTY>
<BATCHALLOCATIONS.LIST>
<GODOWNNAME>${xmlEscape(godown)}</GODOWNNAME>
<BATCHNAME>Primary Batch</BATCHNAME>
<AMOUNT>${amount.toFixed(2)}</AMOUNT>
<ACTUALQTY> ${qty.toFixed(2)} ${unit}</ACTUALQTY>
<BILLEDQTY> ${qty.toFixed(2)} ${unit}</BILLEDQTY>${batchUdfTags}
</BATCHALLOCATIONS.LIST>
<ACCOUNTINGALLOCATIONS.LIST>
<LEDGERNAME>${xmlEscape(salesLedgerName)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<ISPARTYLEDGER>No</ISPARTYLEDGER>
<AMOUNT>${amount.toFixed(2)}</AMOUNT>
</ACCOUNTINGALLOCATIONS.LIST>${udfTags}
</ALLINVENTORYENTRIES.LIST>`;
  }).join('');

  // GST entries (Optional)
  const gstEntries = [];
  const cgstName = payload.cgstLedgerName || 'CGST';
  const sgstName = payload.sgstLedgerName || 'SGST';
  const igstName = payload.igstLedgerName || 'IGST';

  if (cgst > 0) {
    gstEntries.push(`
<LEDGERENTRIES.LIST>
<LEDGERNAME>${xmlEscape(cgstName)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<ISPARTYLEDGER>No</ISPARTYLEDGER>
<AMOUNT>${cgst.toFixed(2)}</AMOUNT>
</LEDGERENTRIES.LIST>`);
    gstEntries.push(`
<LEDGERENTRIES.LIST>
<LEDGERNAME>${xmlEscape(sgstName)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<ISPARTYLEDGER>No</ISPARTYLEDGER>
<AMOUNT>${sgst.toFixed(2)}</AMOUNT>
</LEDGERENTRIES.LIST>`);
  } else if (igst > 0) {
    gstEntries.push(`
<LEDGERENTRIES.LIST>
<LEDGERNAME>${xmlEscape(igstName)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<ISPARTYLEDGER>No</ISPARTYLEDGER>
<AMOUNT>${igst.toFixed(2)}</AMOUNT>
</LEDGERENTRIES.LIST>`);
  }

  // Calculate delivery/freight charges to balance the invoice
  const itemsTotal = items.reduce((sum, item) => sum + Number(item.taxableAmount ?? item.amount ?? ((item.rate || 0) * (item.quantity || 1))), 0);
  const taxesTotal = (cgst || 0) + (sgst || 0) + (igst || 0);
  const deliveryAmount = Number(grandTotal || 0) - (itemsTotal + taxesTotal);

  if (deliveryAmount > 0.01 || deliveryAmount < -0.01) {
    const freightLedger = payload.ledgers?.freightLedger || "zForwarding Charge- Sale";
    gstEntries.push(`
<LEDGERENTRIES.LIST>
<LEDGERNAME>${xmlEscape(freightLedger)}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<ISPARTYLEDGER>No</ISPARTYLEDGER>
<AMOUNT>${deliveryAmount.toFixed(2)}</AMOUNT>
</LEDGERENTRIES.LIST>`);
  }

  // Bill allocations: supports both New Ref and Agst Ref (e.g. against ADV-0001)
  const vchType = payload.voucherType || "1.GST HO CS";
  const billAllocName = payload.billAllocations?.name || invoiceNumber;
  const billAllocType = payload.billAllocations?.billType || "New Ref";
  const billAllocAmount = payload.billAllocations?.amount != null ? Number(payload.billAllocations.amount) : -grandTotal;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
<HEADER>
<TALLYREQUEST>Import Data</TALLYREQUEST>
</HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>Vouchers</REPORTNAME>
<STATICVARIABLES>
<SVCURRENTCOMPANY>${xmlEscape(targetCompany)}</SVCURRENTCOMPANY>
</STATICVARIABLES>
</REQUESTDESC>
<REQUESTDATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="${xmlEscape(vchType)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
<DATE>${tallyDate}</DATE>
<VCHSTATUSDATE>${tallyDate}</VCHSTATUSDATE>
<NARRATION>${xmlEscape(narration)}</NARRATION>
<VOUCHERTYPENAME>${xmlEscape(vchType)}</VOUCHERTYPENAME>
<CLASSNAME>GST Sale</CLASSNAME>
<VOUCHERNUMBER>${xmlEscape(invoiceNumber)}</VOUCHERNUMBER>
<PARTYLEDGERNAME>${xmlEscape(debtorLedgerName)}</PARTYLEDGERNAME>
<PARTYNAME>${xmlEscape(debtorLedgerName)}</PARTYNAME>
<BASICBUYERNAME>${xmlEscape(debtorLedgerName)}</BASICBUYERNAME>
<PARTYMAILINGNAME>${xmlEscape(debtorLedgerName)}</PARTYMAILINGNAME>
<STATENAME>${xmlEscape(state)}</STATENAME>
<PLACEOFSUPPLY>${xmlEscape(state)}</PLACEOFSUPPLY>
<COUNTRYOFRESIDENCE>India</COUNTRYOFRESIDENCE>
<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
<CMPGSTREGISTRATIONTYPE>Regular</CMPGSTREGISTRATIONTYPE>
<CMPGSTSTATE>${xmlEscape(state)}</CMPGSTSTATE>
<VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
<ISINVOICE>Yes</ISINVOICE>
<ISDELETED>No</ISDELETED>

${itemEntries}

<LEDGERENTRIES.LIST>
  <LEDGERNAME>${xmlEscape(debtorLedgerName)}</LEDGERNAME>
  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
  <AMOUNT>-${grandTotal.toFixed(2)}</AMOUNT>
  <BILLALLOCATIONS.LIST>
    <NAME>${xmlEscape(billAllocName)}</NAME>
    <BILLTYPE>${xmlEscape(billAllocType)}</BILLTYPE>
    <AMOUNT>${billAllocAmount.toFixed(2)}</AMOUNT>
  </BILLALLOCATIONS.LIST>
</LEDGERENTRIES.LIST>

${gstEntries.join('')}

<UDF:HECOMMONGODOWN>${xmlEscape(commonGodown)}</UDF:HECOMMONGODOWN>
</VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Receipt Voucher XML
 */
function buildReceiptVoucherXML(payload, educationalMode = true) {
  // Support both old field names (voucherNumber/amount/bankLedgerName)
  // and new field names (receiptEntryNumber/totalAmount/cashLedger)
  const tallyCompanyName = process.env.TALLY_COMPANY_NAME || payload.tallyCompanyName || 'Website Testing Hindustan';
  const receiptEntryNumber = payload.receiptEntryNumber || payload.voucherNumber || '';
  const voucherDate        = payload.voucherDate || payload.invoiceDate || null;
  const totalAmount        = Number(payload.totalAmount ?? payload.amount ?? 0);
  const paymentMode        = (payload.paymentMode || 'CASH').toUpperCase();
  const allocations        = Array.isArray(payload.allocations) ? payload.allocations : [];
  const cashLedger         = payload.cashLedger;
  const bankLedger         = payload.bankLedger;
  const bankName           = payload.bankName;
  const upiApp             = payload.upiApp;
  const customerName       = payload.debtorLedgerName || payload.customerName || 'Sundry Debtors';
  const remarks            = payload.remarks || '';
  const voucherType        = payload.voucherType || (paymentMode === 'CASH' ? 'Rec10 B8 Cash' : 'Rec1 B1 Bank');
  // "Create" for brand-new, "Alter" to update existing (manually-entered) vouchers
  const action             = payload.action || 'Create';

  // Backward compat: old builder had bankLedgerName
  const legacyBankLedger   = payload.bankLedgerName;

  const tallyDate    = toTallyDate(voucherDate, educationalMode);
  const amountNum    = totalAmount;


  // Determine cash/bank ledger from paymentMode matching Tally chart of accounts:
  // Bank: Federal 2091, ICICI Bank, HDFC Bank, Canara Bank
  // Cash: Cash, Cash B2
  let cashBankLedger = 'Federal 2091';
  if (paymentMode === 'CASH') {
    cashBankLedger = (cashLedger && !cashLedger.startsWith('Rec') && !cashLedger.startsWith('Main')) ? cashLedger : 'Cash';
  } else if (paymentMode === 'UPI') {
    cashBankLedger = (bankLedger && !bankLedger.startsWith('Rec')) ? bankLedger : 'Federal 2091';
  } else if (paymentMode === 'BANK') {
    if (bankLedger && !bankLedger.startsWith('Rec')) {
      cashBankLedger = bankLedger;
    } else {
      cashBankLedger = bankName || legacyBankLedger || 'Federal 2091';
    }
  } else {
    cashBankLedger = 'Cash';
  }

  // ── Build BILLALLOCATIONS.LIST ──────────────────────────────────────────────
  let billAllocs = '';

  if (payload.billAllocations) {
    const bAllocs = Array.isArray(payload.billAllocations) ? payload.billAllocations : [payload.billAllocations];
    billAllocs = bAllocs.map(b => `
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(b.name || receiptEntryNumber)}</NAME>
                <BILLTYPE>${xmlEscape(b.billType || 'On Account')}</BILLTYPE>
                <AMOUNT>${Number(b.amount || amountNum).toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`).join('');
  } else if (allocations.length === 0) {
    // No invoice linked → On Account (required for bill-by-bill tracking ledgers)
    billAllocs = `
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(receiptEntryNumber || 'Advance')}</NAME>
                <BILLTYPE>On Account</BILLTYPE>
                <AMOUNT>${amountNum.toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`;
  } else {
    // Agst Ref for each invoice
    for (const alloc of allocations) {
      const allocAmt = Number(alloc.amount || 0);
      if (allocAmt <= 0) continue;
      billAllocs += `
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(alloc.invoiceNumber || alloc.refId || '')}</NAME>
                <BILLTYPE>Agst Ref</BILLTYPE>
                <AMOUNT>${allocAmt.toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`;
    }
  }

  const narration = remarks
    ? `Receipt | ${remarks}`
    : `Receipt from ${customerName} | Mode: ${paymentMode}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(tallyCompanyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${xmlEscape(voucherType)}" ACTION="${action}" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>${xmlEscape(voucherType)}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${xmlEscape(receiptEntryNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${xmlEscape(customerName)}</PARTYLEDGERNAME>
            <NARRATION>${xmlEscape(narration)}</NARRATION>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <HASCASHFLOW>Yes</HASCASHFLOW>

            <!-- Cash/Bank Dr side -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(cashBankLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-${amountNum.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- Customer Cr side with bill allocations -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(customerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>${amountNum.toFixed(2)}</AMOUNT>
              ${billAllocs}
            </ALLLEDGERENTRIES.LIST>

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}


/**
 * Generates a Payment Voucher XML
 */
function buildPaymentVoucherXML(payload, educationalMode = true) {
  const {
    voucherNumber,
    voucherDate,
    amount,
    supplierName,
    bankLedgerName, // legacy fallback
    paymentMode = 'CASH',
    cashLedger = 'Cash',
    upiApp,
    bankName,
    action = 'Alter',
    allocations = [],
    narration = '',
    isSupplierPayment = true,
  } = payload;
  const tallyCompanyName = process.env.TALLY_COMPANY_NAME || ((payload.tallyCompanyName && payload.tallyCompanyName !== 'Auravionx') ? payload.tallyCompanyName : 'Website Testing Hindustan');

  const tallyDate = toTallyDate(voucherDate, educationalMode);
  const amountNum = Number(amount);

  let cashBankLedger = 'Cash';
  if (paymentMode === 'CASH') {
    cashBankLedger = cashLedger || bankLedgerName || 'Cash';
  } else if (paymentMode === 'UPI') {
    cashBankLedger = upiApp || bankLedgerName || 'Bank';
  } else if (paymentMode === 'BANK_TRANSFER' || paymentMode === 'BANK') {
    cashBankLedger = bankName || bankLedgerName || 'Bank';
  } else {
    cashBankLedger = cashLedger || bankLedgerName || 'Cash';
  }

  // Tally Payment voucher: Debit Supplier (-amount), Credit Bank (+amount)
  const allocatedTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
  const advanceAmount  = Math.max(0, amountNum - allocatedTotal);

  let billAllocs = '';
  if (isSupplierPayment) {
    if (allocations.length === 0) {
      billAllocs = `
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(voucherNumber || 'Advance')}</NAME>
                <BILLTYPE>On Acct</BILLTYPE>
                <AMOUNT>-${amountNum.toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`;
    } else {
      allocations.forEach(a => {
        billAllocs += `
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(a.invoiceNumber)}</NAME>
                <BILLTYPE>Agst Ref</BILLTYPE>
                <AMOUNT>-${Number(a.amount).toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`;
      });
      if (advanceAmount > 0) {
        billAllocs += `
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(voucherNumber || 'Advance')}</NAME>
                <BILLTYPE>Advance</BILLTYPE>
                <AMOUNT>-${advanceAmount.toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(tallyCompanyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Payment" ACTION="${action}" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${xmlEscape(supplierName)}</PARTYLEDGERNAME>
            <VOUCHERNUMBER>${xmlEscape(voucherNumber)}</VOUCHERNUMBER>
            <NARRATION>${xmlEscape(narration)}</NARRATION>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <VCHSTATUSVOUCHERTYPE>Payment</VCHSTATUSVOUCHERTYPE>

            <ALLLEDGERENTRIES.LIST>
             <LEDGERNAME>${xmlEscape(supplierName)}</LEDGERNAME>
             <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
             <ISPARTYLEDGER>${isSupplierPayment ? 'Yes' : 'No'}</ISPARTYLEDGER>
             <AMOUNT>-${amountNum.toFixed(2)}</AMOUNT>
             ${billAllocs}
            </ALLLEDGERENTRIES.LIST>

            <ALLLEDGERENTRIES.LIST>
             <LEDGERNAME>${xmlEscape(cashBankLedger)}</LEDGERNAME>
             <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
             <ISPARTYLEDGER>No</ISPARTYLEDGER>
             <AMOUNT>${amountNum.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Journal Voucher XML
 */
function buildJournalVoucherXML(payload, educationalMode = true) {
  const {
    tallyCompanyName = 'Auravionx',
    voucherNumber,
    voucherDate,
    entries, // array of { ledgerName, amount, isDebit: true/false }
  } = payload;

  const tallyDate = toTallyDate(voucherDate, educationalMode);

  const entryXML = entries.map(entry => {
      // In Tally Journal: Debit is Yes/Negative Amount. Credit is No/Positive Amount.
      const isDebit = entry.isDebit ? 'Yes' : 'No';
      const amt = entry.isDebit ? -Math.abs(entry.amount) : Math.abs(entry.amount);
      return `
            <ALLLEDGERENTRIES.LIST>
             <LEDGERNAME>${xmlEscape(entry.ledgerName)}</LEDGERNAME>
             <ISDEEMEDPOSITIVE>${isDebit}</ISDEEMEDPOSITIVE>
             <AMOUNT>${amt.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(tallyCompanyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Journal" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${xmlEscape(voucherNumber)}</VOUCHERNUMBER>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <VCHSTATUSVOUCHERTYPE>Journal</VCHSTATUSVOUCHERTYPE>
            ${entryXML}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Contra Voucher XML
 */
function buildContraVoucherXML(payload, educationalMode = true) {
  const {
    tallyCompanyName = 'Auravionx',
    voucherNumber,
    voucherDate,
    amount,
    fromLedgerName, // The ledger giving money (Credit - Positive Amount)
    toLedgerName,   // The ledger receiving money (Debit - Negative Amount)
  } = payload;

  const tallyDate = toTallyDate(voucherDate, educationalMode);
  const amountNum = Number(amount);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(tallyCompanyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Contra" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Contra</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${xmlEscape(voucherNumber)}</VOUCHERNUMBER>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <VCHSTATUSVOUCHERTYPE>Contra</VCHSTATUSVOUCHERTYPE>

            <ALLLEDGERENTRIES.LIST>
             <LEDGERNAME>${xmlEscape(fromLedgerName)}</LEDGERNAME>
             <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
             <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
             <AMOUNT>${amountNum.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <ALLLEDGERENTRIES.LIST>
             <LEDGERNAME>${xmlEscape(toLedgerName)}</LEDGERNAME>
             <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
             <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
             <AMOUNT>-${amountNum.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Customer Ledger XML
 */
function buildCustomerLedgerXML(payload) {
  const {
    tallyCompanyName = 'Auravionx',
    ledgerName,
    parentGroup = 'Sundry Debtors',
    state = 'Karnataka',
    country = 'India',
    address = '',
    gstin = '',
    pinCode = '',
    mobile = '',
  } = payload;

  const addressTag = address ? `
       <LEDMAILINGDETAILS.LIST>
        <ADDRESS.LIST TYPE="String">
         <ADDRESS>${xmlEscape(address)}</ADDRESS>
        </ADDRESS.LIST>
        <APPLICABLEFROM>20260401</APPLICABLEFROM>
        <MAILINGNAME>${xmlEscape(ledgerName)}</MAILINGNAME>
        <STATE>${xmlEscape(state)}</STATE>
        <COUNTRY>${xmlEscape(country)}</COUNTRY>
       </LEDMAILINGDETAILS.LIST>` : `
       <LEDMAILINGDETAILS.LIST>
        <APPLICABLEFROM>20260401</APPLICABLEFROM>
        <MAILINGNAME>${xmlEscape(ledgerName)}</MAILINGNAME>
        <STATE>${xmlEscape(state)}</STATE>
        <COUNTRY>${xmlEscape(country)}</COUNTRY>
       </LEDMAILINGDETAILS.LIST>`;

  const gstTag = gstin ? `
       <LEDGSTREGDETAILS.LIST>
        <APPLICABLEFROM>20260401</APPLICABLEFROM>
        <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
        <GSTIN>${xmlEscape(gstin)}</GSTIN>
        <PLACEOFSUPPLY>${xmlEscape(state)}</PLACEOFSUPPLY>
       </LEDGSTREGDETAILS.LIST>` : `
       <LEDGSTREGDETAILS.LIST>
        <APPLICABLEFROM>20260401</APPLICABLEFROM>
        <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
        <PLACEOFSUPPLY>${xmlEscape(state)}</PLACEOFSUPPLY>
       </LEDGSTREGDETAILS.LIST>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(tallyCompanyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${xmlEscape(ledgerName)}" ACTION="Create">
            <NAME.LIST>
              <NAME>${xmlEscape(ledgerName)}</NAME>
            </NAME.LIST>
            <PARENT>${xmlEscape(parentGroup)}</PARENT>
            <CURRENCYNAME>&#8377;</CURRENCYNAME>
            <ISBILLWISEON>Yes</ISBILLWISEON>
            <AFFECTSSTOCK>No</AFFECTSSTOCK>
            <COUNTRYOFRESIDENCE>${xmlEscape(country)}</COUNTRYOFRESIDENCE>
            <PRIORSTATENAME>${xmlEscape(state)}</PRIORSTATENAME>
            <PINCODE>${xmlEscape(pinCode)}</PINCODE>
            <LEDGERPHONE>${xmlEscape(mobile)}</LEDGERPHONE>
            ${addressTag}
            ${gstTag}
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Supplier Ledger XML
 */
function buildSupplierLedgerXML(payload) {
  const {
    tallyCompanyName = 'Auravionx',
    ledgerName,
    parentGroup = 'Sundry Creditors',
    state = 'Karnataka',
    country = 'India',
    address = '',
    gstin = '',
    pinCode = '',
    mobile = '',
  } = payload;

  // The structure is identical to Customer, just the default parentGroup is different
  return buildCustomerLedgerXML({
    ...payload,
    tallyCompanyName,
    ledgerName,
    parentGroup,
    state,
    country,
    address,
    gstin,
    pinCode,
    mobile,
  });
}

/**
 * Generates an Export XML for fetching masters or Trial Balance.
 */
function buildFetchXML(reportName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${reportName}</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Stock Group (Category) XML
 */
function buildStockGroupXML(payload) {
  const {
    tallyCompanyName = 'Auravionx',
    groupName,
    parentGroup = '', // blank means top-level
    hsnCode = '',
    gstRate = 0
  } = payload;

  const gstTag = gstRate > 0 ? `
      <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
      <HSNCODE>${xmlEscape(hsnCode)}</HSNCODE>
      <TAXABILITY>Taxable</TAXABILITY>
      <STATEWISEDETAILS.LIST>
       <STATENAME>&#4; Any</STATENAME>
       <RATEDETAILS.LIST>
        <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
        <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
        <GSTRATE>${gstRate / 2}</GSTRATE>
       </RATEDETAILS.LIST>
       <RATEDETAILS.LIST>
        <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
        <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
        <GSTRATE>${gstRate / 2}</GSTRATE>
       </RATEDETAILS.LIST>
       <RATEDETAILS.LIST>
        <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
        <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
        <GSTRATE>${gstRate}</GSTRATE>
       </RATEDETAILS.LIST>
      </STATEWISEDETAILS.LIST>` : `
      <GSTAPPLICABLE>&#4; Not Applicable</GSTAPPLICABLE>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>${xmlEscape(tallyCompanyName)}</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKGROUP NAME="${xmlEscape(groupName)}" ACTION="Create">
      <NAME.LIST>
       <NAME>${xmlEscape(groupName)}</NAME>
      </NAME.LIST>
      <PARENT>${xmlEscape(parentGroup)}</PARENT>
      <ISADDABLE>Yes</ISADDABLE>
      <ISDELETED>No</ISDELETED>
      <ASORIGINAL>Yes</ASORIGINAL>
${gstTag}
      <LANGUAGENAME.LIST>
       <NAME.LIST TYPE="String">
        <NAME>${xmlEscape(groupName)}</NAME>
       </NAME.LIST>
       <LANGUAGEID>1033</LANGUAGEID>
      </LANGUAGENAME.LIST>
     </STOCKGROUP>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Stock Item (Product) XML
 */
function buildStockItemXML(payload) {
  const {
    tallyCompanyName = 'Auravionx',
    itemName,
    parentGroup = 'Primary',
    baseUnit = 'Nos',
    hsnCode = '',
    gstRate = 0,
    openingQty = 0,
    openingRate = 0,
    openingValue = 0,
  } = payload;

  const gstTag = gstRate > 0 ? `
      <GSTDETAILS.LIST>
       <APPLICABLEFROM>20260401</APPLICABLEFROM>
       <HSNCODE>${xmlEscape(hsnCode)}</HSNCODE>
       <TAXABILITY>Taxable</TAXABILITY>
       <ISREVERSECHARGEAPPLICABLE>No</ISREVERSECHARGEAPPLICABLE>
       <ISNONGSTGOODS>No</ISNONGSTGOODS>
       <STATEWISEDETAILS.LIST>
        <STATENAME>&#4; Any</STATENAME>
        <RATEDETAILS.LIST>
         <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
         <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
         <GSTRATE>${gstRate / 2}</GSTRATE>
        </RATEDETAILS.LIST>
        <RATEDETAILS.LIST>
         <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
         <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
         <GSTRATE>${gstRate / 2}</GSTRATE>
        </RATEDETAILS.LIST>
        <RATEDETAILS.LIST>
         <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
         <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
         <GSTRATE>${gstRate}</GSTRATE>
        </RATEDETAILS.LIST>
       </STATEWISEDETAILS.LIST>
      </GSTDETAILS.LIST>` : '';

  const openingTag = openingQty > 0 ? `
      <OPENINGBALANCE>${openingQty} ${xmlEscape(baseUnit)}</OPENINGBALANCE>
      <OPENINGRATE>${openingRate}/${xmlEscape(baseUnit)}</OPENINGRATE>
      <OPENINGVALUE>${openingValue}</OPENINGVALUE>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>${xmlEscape(tallyCompanyName)}</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <STOCKITEM NAME="${xmlEscape(itemName)}" ACTION="Create">
      <NAME.LIST>
        <NAME>${xmlEscape(itemName)}</NAME>
      </NAME.LIST>
      <PARENT>${xmlEscape(parentGroup)}</PARENT>
      <CATEGORY>&#4; Not Applicable</CATEGORY>
      <BASEUNITS>${xmlEscape(baseUnit)}</BASEUNITS>
      <ISBATCHWISEON>No</ISBATCHWISEON>
      <ISPERISHABLEON>No</ISPERISHABLEON>
      <ISENTRYTAXAPPLICABLE>No</ISENTRYTAXAPPLICABLE>
      <ISCOSTTRACKINGON>No</ISCOSTTRACKINGON>
      <ISUPDATINGTARGETID>No</ISUPDATINGTARGETID>
      <ISDELETED>No</ISDELETED>
      <ASORIGINAL>Yes</ASORIGINAL>
${gstTag}
${openingTag}
      <LANGUAGENAME.LIST>
       <NAME.LIST TYPE="String">
        <NAME>${xmlEscape(itemName)}</NAME>
       </NAME.LIST>
       <LANGUAGEID>1033</LANGUAGEID>
      </LANGUAGENAME.LIST>
     </STOCKITEM>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

module.exports = {
  buildSalesInvoiceXML,
  buildReceiptVoucherXML,
  buildPaymentVoucherXML,
  buildJournalVoucherXML,
  buildContraVoucherXML,
  buildCustomerLedgerXML,
  buildSupplierLedgerXML,
  buildStockItemXML,
  buildStockGroupXML,
  buildFetchXML,
};
