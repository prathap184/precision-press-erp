/**
 * XML BUILDER — Tally Sync Engine
 * ─────────────────────────────────
 * Converts ERP JSON payloads into strict Tally XML.
 * 
 * Handles:
 *   ✅ Sales Invoice  (F8) with New Ref
 *   ✅ Receipt Voucher (F6) with New Ref / Agst Ref / On Account
 *   ✅ Customer Ledger with Alias (ERP contact.id)
 *   ✅ Supplier Ledger with Alias
 *   ✅ Fetch Masters (Export Data request)
 *   ✅ XML Sanitization (& < > " ')
 *   ✅ Rounding Fix (auto-balance debits/credits)
 *   ✅ GST Split (CGST+SGST or IGST)
 */

// ─── XML Sanitization ─────────────────────────────────────────────────────────

function sanitize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .substring(0, 100); // Tally field length limit
}

function toFixed2(num) {
  return (Math.round(Number(num) * 100) / 100).toFixed(2);
}

function toTallyDate(dateStr) {
  // Accepts: "2026-08-11", "20260811", or ISO string
  if (!dateStr) {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  return dateStr.replace(/-/g, '').substring(0, 8);
}

// ─── SALES INVOICE (F8) ───────────────────────────────────────────────────────

function buildSalesInvoiceXML(payload) {
  const p = payload;
  const companyName = sanitize(p.tallyCompanyName);
  const invoiceNumber = sanitize(p.invoiceNumber);
  const invoiceDate = toTallyDate(p.invoiceDate || p.voucherDate);
  const customerName = sanitize(p.customerName);
  const customerGST = sanitize(p.customerGST || p.gstin || '');
  const narration = sanitize(p.narration || `ERP Invoice: ${p.invoiceNumber}`);

  const subTotal = Number(p.subTotal) || 0;
  const cgst = Number(p.cgst) || 0;
  const sgst = Number(p.sgst) || 0;
  const igst = Number(p.igst) || 0;
  const deliveryCharges = Number(p.deliveryCharges) || 0;
  const grandTotal = Number(p.grandTotal) || 0;

  // Auto-balance: ensure debits = credits
  const totalTax = cgst + sgst + igst;
  const computedGrand = subTotal + totalTax + deliveryCharges;
  const roundingDiff = Number(toFixed2(grandTotal - computedGrand));

  // Build inventory entries for each item
  let inventoryEntries = '';
  const items = p.items || [];
  for (const item of items) {
    const itemName = sanitize(item.productName || item.name || 'Printing Services');
    const qty = Number(item.quantity || item.sqft || 1);
    const rate = Number(item.rate || 0);
    const amount = Number(item.amount || 0);

    inventoryEntries += `
            <ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>${itemName}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <RATE>${toFixed2(rate)}/${sanitize(item.unit || 'Sq Ft')}</RATE>
                <AMOUNT>-${toFixed2(amount)}</AMOUNT>
                <ACTUALQTY>${toFixed2(qty)} ${sanitize(item.unit || 'Sq Ft')}</ACTUALQTY>
                <BILLEDQTY>${toFixed2(qty)} ${sanitize(item.unit || 'Sq Ft')}</BILLEDQTY>
            </ALLINVENTORYENTRIES.LIST>`;
  }

  // Build GST ledger entries
  let gstEntries = '';
  if (igst > 0) {
    gstEntries = `
            <LEDGERENTRIES.LIST>
                <LEDGERNAME>Output IGST</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>-${toFixed2(igst)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
  } else {
    if (cgst > 0) {
      gstEntries += `
            <LEDGERENTRIES.LIST>
                <LEDGERNAME>Output CGST</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>-${toFixed2(cgst)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
    }
    if (sgst > 0) {
      gstEntries += `
            <LEDGERENTRIES.LIST>
                <LEDGERNAME>Output SGST</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>-${toFixed2(sgst)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
    }
  }

  // Delivery charges entry
  let deliveryEntry = '';
  if (deliveryCharges > 0) {
    deliveryEntry = `
            <LEDGERENTRIES.LIST>
                <LEDGERNAME>Transport Charges</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>-${toFixed2(deliveryCharges)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
  }

  // Rounding entry (auto-balance fix)
  let roundingEntry = '';
  if (Math.abs(roundingDiff) > 0.001) {
    roundingEntry = `
            <LEDGERENTRIES.LIST>
                <LEDGERNAME>Rounding Off</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${roundingDiff > 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
                <AMOUNT>${toFixed2(-roundingDiff)}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
  }

  return `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="Sales" ACTION="Create">
                        <DATE>${invoiceDate}</DATE>
                        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>${invoiceNumber}</VOUCHERNUMBER>
                        <REFERENCE>${invoiceNumber}</REFERENCE>
                        <PARTYLEDGERNAME>${customerName}</PARTYLEDGERNAME>
                        <PARTYGSTIN>${customerGST}</PARTYGSTIN>
                        <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
                        <ISINVOICE>Yes</ISINVOICE>
                        <NARRATION>${narration}</NARRATION>
                        <HASAUTOENTRY>No</HASAUTOENTRY>
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>${customerName}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>${toFixed2(grandTotal)}</AMOUNT>
                            <BILLALLOCATIONS.LIST>
                                <BILLTYPE>New Ref</BILLTYPE>
                                <NAME>${invoiceNumber}</NAME>
                                <AMOUNT>${toFixed2(grandTotal)}</AMOUNT>
                            </BILLALLOCATIONS.LIST>
                        </LEDGERENTRIES.LIST>${inventoryEntries}${gstEntries}${deliveryEntry}${roundingEntry}
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

// ─── RECEIPT VOUCHER (F6) ─────────────────────────────────────────────────────

function buildReceiptXML(payload) {
  const p = payload;
  const companyName = sanitize(p.tallyCompanyName);
  const voucherNumber = sanitize(p.receiptEntryNumber || p.voucherNumber || '');
  const voucherDate = toTallyDate(p.voucherDate);
  const customerName = sanitize(p.customerName);
  const amount = Number(p.totalAmount || p.amount || 0);
  const narration = sanitize(p.narration || `ERP Receipt: ${voucherNumber}`);

  // Determine the payment ledger (Cash or Bank)
  const mode = (p.paymentMode || 'CASH').toUpperCase();
  let paymentLedger = 'Cash';
  if (mode === 'CASH') {
    paymentLedger = sanitize(p.cashLedger || 'Cash');
  } else if (mode === 'UPI') {
    paymentLedger = sanitize(p.bankLedger || p.upiLedger || 'Bank');
  } else {
    paymentLedger = sanitize(p.bankLedger || 'Bank');
  }

  // ── Bill Allocation Logic ──────────────────────────────────────────────────
  // This is the CRITICAL part that the old code got wrong.
  //
  // 3 scenarios:
  //   1. Agst Ref  → Receipt is against a specific invoice (allocations has entries)
  //   2. New Ref   → Receipt is a customer advance/prepayment (no invoice linked, but tracked)
  //   3. On Account → Floating money, no tracking (rare, only if explicitly flagged)

  const allocations = p.allocations || [];
  let billAllocXml = '';

  if (allocations.length > 0) {
    // SCENARIO 1: Agst Ref — paying against specific invoices
    for (const alloc of allocations) {
      billAllocXml += `
                            <BILLALLOCATIONS.LIST>
                                <BILLTYPE>Agst Ref</BILLTYPE>
                                <NAME>${sanitize(alloc.invoiceNumber)}</NAME>
                                <AMOUNT>-${toFixed2(alloc.amount)}</AMOUNT>
                            </BILLALLOCATIONS.LIST>`;
    }
  } else if (p.billType === 'On Account') {
    // SCENARIO 3: On Account — explicit floating money
    billAllocXml = `
                            <BILLALLOCATIONS.LIST>
                                <BILLTYPE>On Account</BILLTYPE>
                                <AMOUNT>-${toFixed2(amount)}</AMOUNT>
                            </BILLALLOCATIONS.LIST>`;
  } else {
    // SCENARIO 2: New Ref — customer prepayment/advance (DEFAULT for unlinked receipts)
    // This is what the OLD code was MISSING. It used On Account instead of New Ref.
    // New Ref creates a trackable bucket that can be linked later via Agst Ref.
    const refName = sanitize(p.refName || voucherNumber);
    billAllocXml = `
                            <BILLALLOCATIONS.LIST>
                                <BILLTYPE>New Ref</BILLTYPE>
                                <NAME>${refName}</NAME>
                                <AMOUNT>-${toFixed2(amount)}</AMOUNT>
                            </BILLALLOCATIONS.LIST>`;
  }

  return `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="Receipt" ACTION="Create">
                        <DATE>${voucherDate}</DATE>
                        <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
                        <REFERENCE>${voucherNumber}</REFERENCE>
                        <PARTYLEDGERNAME>${customerName}</PARTYLEDGERNAME>
                        <NARRATION>${narration}</NARRATION>
                        <HASAUTOENTRY>No</HASAUTOENTRY>
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>${paymentLedger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-${toFixed2(amount)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>${customerName}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${toFixed2(amount)}</AMOUNT>${billAllocXml}
                        </ALLLEDGERENTRIES.LIST>
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

// ─── CUSTOMER LEDGER (with Alias) ─────────────────────────────────────────────

function buildCustomerLedgerXML(payload) {
  const p = payload;
  const companyName = sanitize(p.tallyCompanyName);
  const ledgerName = sanitize(p.ledgerName);
  const parentGroup = sanitize(p.parentGroup || 'Sundry Debtors');
  const state = sanitize(p.state || 'Karnataka');
  const country = sanitize(p.country || 'India');
  const address = sanitize(p.address || '');
  const gstin = sanitize(p.gstin || '');
  const pinCode = sanitize(p.pinCode || '');
  const mobile = sanitize(p.mobile || p.phone || '');
  const email = sanitize(p.email || '');

  // THE ALIAS FIX: Inject ERP contact.id as a permanent Alias
  // This is what the OLD code was MISSING.
  // Even if the accountant renames the ledger in Tally, the Alias stays.
  const erpId = sanitize(p.erpContactId || p.customerId || '');

  return `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>All Masters</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <LEDGER NAME="${ledgerName}" ACTION="Create">
                        <NAME.LIST>
                            <NAME>${ledgerName}</NAME>${erpId ? `
                            <NAME>${erpId}</NAME>` : ''}
                        </NAME.LIST>
                        <PARENT>${parentGroup}</PARENT>
                        <ISBILLWISEON>Yes</ISBILLWISEON>
                        <LEDSTATENAME>${state}</LEDSTATENAME>
                        <COUNTRYNAME>${country}</COUNTRYNAME>${address ? `
                        <ADDRESS.LIST>
                            <ADDRESS>${address}</ADDRESS>
                        </ADDRESS.LIST>` : ''}${gstin ? `
                        <PARTYGSTIN>${gstin}</PARTYGSTIN>
                        <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : ''}${pinCode ? `
                        <PINCODE>${pinCode}</PINCODE>` : ''}${mobile ? `
                        <LEDGERMOBILE>${mobile}</LEDGERMOBILE>` : ''}${email ? `
                        <LEDGEREMAIL>${email}</LEDGEREMAIL>` : ''}
                    </LEDGER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

// ─── SUPPLIER LEDGER (with Alias) ─────────────────────────────────────────────

function buildSupplierLedgerXML(payload) {
  // Suppliers use the exact same XML structure, just under "Sundry Creditors"
  return buildCustomerLedgerXML({
    ...payload,
    parentGroup: payload.parentGroup || 'Sundry Creditors',
  });
}

// ─── FETCH MASTERS (Export Data) ──────────────────────────────────────────────

function buildFetchMastersXML(companyName) {
  const finalCompanyName = companyName || process.env.TALLY_COMPANY_NAME || '';

  return `
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>AllLedgers</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                ${finalCompanyName ? `<SVCURRENTCOMPANY>${sanitize(finalCompanyName)}</SVCURRENTCOMPANY>` : ''}
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="AllLedgers" ISMODIFY="No" ISINITIALIZE="Yes">
                        <TYPE>Ledger</TYPE>
                        <NATIVEMETHOD>Name</NATIVEMETHOD>
                        <NATIVEMETHOD>Parent</NATIVEMETHOD>
                        <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
                        <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
                        <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
                        <NATIVEMETHOD>LedStateName</NATIVEMETHOD>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`;
}

// ─── MASTER ROUTER ────────────────────────────────────────────────────────────


function buildXML(syncType, payload) {
  switch (syncType) {
    case 'SALES_INVOICE':
      return buildSalesInvoiceXML(payload);
    case 'RECEIPT_VOUCHER':
      return buildReceiptXML(payload);
    case 'CREATE_CUSTOMER':
      return buildCustomerLedgerXML(payload);
    case 'CREATE_SUPPLIER':
      return buildSupplierLedgerXML(payload);
    case 'FETCH_MASTERS':
      return buildFetchMastersXML(payload.tallyCompanyName);
    default:
      throw new Error(`Unsupported sync type: ${syncType}`);
  }
}

module.exports = {
  buildXML,
  buildSalesInvoiceXML,
  buildReceiptXML,
  buildCustomerLedgerXML,
  buildSupplierLedgerXML,
  buildFetchMastersXML,
  sanitize,
  toFixed2,
  toTallyDate,
};
