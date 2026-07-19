/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║        PRECISION PRESS ERP — TALLY CONNECTOR SERVICE                       ║
 * ║        Version: 1.0.0                                                      ║
 * ║        Runs ONLY on: Accounts Department PC                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ARCHITECTURE:
 *   Cloud ERP (Firebase/Vercel)
 *     └─▶ tally_sync_queue (Firestore)
 *              └─▶ This Service (polls every ~8s)
 *                      └─▶ Generates Tally XML
 *                              └─▶ POST to localhost:9000
 *                                      └─▶ TallyPrime
 *                                              └─▶ Mark result back to ERP
 *
 * REQUIREMENTS:
 *   - Node.js 18+
 *   - TallyPrime running on this PC with HTTP server enabled on port 9000
 *   - .env file configured (copy from .env.example)
 *
 * SETUP:
 *   1. npm install
 *   2. cp .env.example .env  (then fill in your values)
 *   3. node connector.js
 */

'use strict';

require('dotenv').config();
const axios    = require('axios');
const winston  = require('winston');
const xml2js   = require('xml2js');
const fs       = require('fs');
const path     = require('path');

// ─── Validate Environment ─────────────────────────────────────────────────────

const REQUIRED_ENV = ['ERP_BASE_URL', 'CONNECTOR_SECRET', 'TALLY_HOST', 'TALLY_PORT'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error('   Copy .env.example to .env and fill in all values.');
    process.exit(1);
  }
}

const ERP_BASE_URL   = process.env.ERP_BASE_URL.replace(/\/$/, '');
const CONNECTOR_SECRET = process.env.CONNECTOR_SECRET;
const TALLY_URL      = `${process.env.TALLY_HOST}:${process.env.TALLY_PORT}`;
const POLL_MS        = parseInt(process.env.POLL_INTERVAL_MS || '8000', 10);
const LOG_FILE       = process.env.LOG_FILE || './logs/connector.log';

// TALLY_EDUCATIONAL_MODE=true → clamp dates to 1st of month so Tally's
// Educational (trial) copy accepts them. Set to false on a licensed copy.
const EDUCATIONAL_MODE = (process.env.TALLY_EDUCATIONAL_MODE || 'true').toLowerCase() === 'true';

// ─── Logger ───────────────────────────────────────────────────────────────────

const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: LOG_FILE, maxsize: 5 * 1024 * 1024, maxFiles: 5 }),
  ],
});

// ─── ERP API Client ───────────────────────────────────────────────────────────

const erpApi = axios.create({
  baseURL: ERP_BASE_URL,
  headers: { 'x-connector-secret': CONNECTOR_SECRET },
  timeout: 15000,
});

// ─── Tally API Client ─────────────────────────────────────────────────────────

const tallyApi = axios.create({
  baseURL: TALLY_URL,
  headers: { 'Content-Type': 'application/xml' },
  timeout: 30000,
});

// ─── XML Generators ───────────────────────────────────────────────────────────

/**
 * Generates a Sales Invoice XML for TallyPrime.
 * Follows the TDL XML import format.
 */
function buildSalesInvoiceXML(payload) {
  let {
    tallyCompanyName,
    invoiceNumber,
    invoiceDate,
    customerName,
    items,
    subTotal,
    cgst,
    sgst,
    igst,
    grandTotal,
    salesLedgerName,
    gstLedgerName,
  } = payload;

  // Fallbacks
  const actualCompanyName = 'Auravionx'; // Override default from ERP
  if (!invoiceNumber) invoiceNumber = `INV-${Date.now()}`;
  
  if (invoiceDate) {
    invoiceDate = String(invoiceDate).replace(/\D/g, ''); // Strip hyphens
  }
  if (!invoiceDate || String(invoiceDate).length < 8) {
    const d = new Date();
    invoiceDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  // Educational Mode: Tally's trial copy only accepts the 1st, 2nd, and 31st.
  // Any other date returns a misleading "Voucher date is missing" error.
  // Disable via TALLY_EDUCATIONAL_MODE=false in .env when using a licensed copy.
  if (EDUCATIONAL_MODE) {
    invoiceDate = invoiceDate.substring(0, 6) + '01';
  }

  // Build line item ledger entries
  const itemEntries = items.map(item => `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${xmlEscape(item.productName || 'Printing Services')}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <LEDGERFROMITEM>No</LEDGERFROMITEM>
            <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>
            <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`).join('');

  // GST entries
  const gstEntries = (cgst > 0 ? `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>Output CGST</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${cgst.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>Output SGST</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${sgst.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>` : `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>Output IGST</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${igst.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`);

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
          <SVCURRENTCOMPANY>${xmlEscape(actualCompanyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER DATE="${invoiceDate}" VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${invoiceDate}</DATE>
            <EFFECTIVEDATE>${invoiceDate}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${xmlEscape(customerName)}</PARTYLEDGERNAME>
            <VOUCHERNUMBER>${xmlEscape(invoiceNumber)}</VOUCHERNUMBER>
            <NARRATION>ERP Auto-Sync: ${xmlEscape(invoiceNumber)}</NARRATION>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <ISINVOICE>Yes</ISINVOICE>

            ${itemEntries}
            ${gstEntries}

            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(debtorLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${grandTotal.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Generates a Receipt Voucher XML for TallyPrime.
 */
function buildReceiptVoucherXML(payload) {
  // ── 1. Extract fields ─────────────────────────────────────────────────────────
  const {
    voucherNumber,
    voucherDate,
    amount,
    customerName,
    bankLedgerName,
    debtorLedgerName,
  } = payload;

  // ── 2. Strict Validation ──────────────────────────────────────────────────────
  // Resolve customer ledger: debtorLedgerName for credit orders (e.g. customer
  // ledger in Tally); customerName for cash orders (the party ledger name).
  const customerLedger = (debtorLedgerName && debtorLedgerName !== 'Cash') ? debtorLedgerName : customerName;

  const validationErrors = [];
  if (!voucherNumber || String(voucherNumber).trim() === '')
    validationErrors.push('voucherNumber is missing');
  if (!bankLedgerName || String(bankLedgerName).trim() === '')
    validationErrors.push('bankLedgerName is missing');
  if (!customerLedger || String(customerLedger).trim() === '' || customerLedger === 'Customer')
    validationErrors.push(`customerLedger is missing or generic placeholder — got: "${customerLedger}"`);
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
    validationErrors.push(`amount is invalid — got: "${amount}"`);

  if (validationErrors.length > 0) {
    const msg = `FAILED_VALIDATION: ${validationErrors.join('; ')}`;
    logger.error(`❌ ${msg}`);
    throw new Error(msg);
  }

  const amountNum = Number(amount);

  // ── 3. Date Normalisation ─────────────────────────────────────────────────────
  const toTallyDate = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');

  let tallyDate;
  if (!voucherDate || voucherDate === 'undefined' || voucherDate === 'null') {
    tallyDate = toTallyDate(new Date());
  } else if (String(voucherDate).length === 8 && !isNaN(Number(voucherDate))) {
    tallyDate = String(voucherDate);
  } else {
    try { tallyDate = toTallyDate(voucherDate); }
    catch (e) { tallyDate = toTallyDate(new Date()); }
  }

  // Educational Mode: Tally's trial copy only accepts the 1st, 2nd, and 31st.
  // Any other date returns a misleading "Voucher date is missing" error.
  // Disable via TALLY_EDUCATIONAL_MODE=false in .env when using a licensed copy.
  if (EDUCATIONAL_MODE) {
    tallyDate = tallyDate.substring(0, 6) + '01';
  }

  // ── 4. Debug Log ──────────────────────────────────────────────────────────────
  logger.info(`📝 RECEIPT XML PAYLOAD:
    voucherNumber  : ${voucherNumber}
    tallyDate      : ${tallyDate}  (raw: ${voucherDate})
    amount         : ${amountNum.toFixed(2)}
    bankLedger     : ${bankLedgerName}
    customerLedger : ${customerLedger}
  `);

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
          <SVCURRENTCOMPANY>Auravionx</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>${tallyDate}</DATE>
            <EFFECTIVEDATE>${tallyDate}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${xmlEscape(voucherNumber)}</VOUCHERNUMBER>
            <NARRATION>ERP Auto-Sync: ${xmlEscape(voucherNumber)}</NARRATION>

            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(bankLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amountNum.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(customerLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amountNum.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ─── XML Utility ──────────────────────────────────────────────────────────────

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
 * Generates an Export XML for fetching masters (List of Accounts) or Trial Balance.
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

// ─── Parse Tally Response ─────────────────────────────────────────────────────

async function parseTallyResponse(rawXml) {
  try {
    const parsed = await xml2js.parseStringPromise(rawXml, { explicitArray: false });

    // Tally returns a flat <RESPONSE> element (not wrapped in ENVELOPE) for import operations.
    // Primary path: parsed.RESPONSE
    // Fallback path: parsed.ENVELOPE.BODY.IMPORTDATA.IMPORTRESULT (older TDL schemas)
    const flat   = parsed?.RESPONSE;
    const nested = parsed?.ENVELOPE?.BODY?.IMPORTDATA?.IMPORTRESULT
                || parsed?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;
    const response = flat || nested;

    if (!response) {
      logger.warn('Tally response has unexpected structure — treating as failure.');
      logger.warn('Raw response: ' + rawXml.substring(0, 400));
      return { success: false, rawXml: rawXml?.substring(0, 1000) };
    }

    const created    = parseInt(response.CREATED    || '0', 10);
    const altered    = parseInt(response.ALTERED    || '0', 10);
    const errors     = parseInt(response.ERRORS     || '0', 10);
    const exceptions = parseInt(response.EXCEPTIONS || '0', 10);
    const lineerror  = response.LINEERROR || '';

    // SUCCESS = at least one record created/altered, AND no errors or exceptions.
    const success = (created + altered) > 0 && errors === 0 && exceptions === 0;

    logger.info(`📊 Tally result: created=${created} altered=${altered} errors=${errors} exceptions=${exceptions}${lineerror ? ' lineerror=' + lineerror : ''}`);

    return {
      success,
      created,
      altered,
      errors,
      exceptions,
      lastdesc: lineerror || '',
      rawXml: rawXml.substring(0, 1000),
    };
  } catch (e) {
    logger.warn(`Failed to parse Tally XML response: ${e.message}`);
    return { success: false, rawXml: rawXml?.substring(0, 500) };
  }
}

// ─── Process a Single Event ───────────────────────────────────────────────────

async function processEvent(event) {
  logger.info(`Processing: ${event.id} | type: ${event.syncType} | order: ${event.orderId || event.paymentId}`);

  let xml;
  let isExport = false;
  try {
    if (event.syncType === 'SALES_INVOICE') {
      xml = buildSalesInvoiceXML(event.payload);
    } else if (event.syncType === 'RECEIPT_VOUCHER') {
      xml = buildReceiptVoucherXML(event.payload);
    } else if (event.syncType === 'FETCH_MASTERS') {
      xml = buildFetchXML('List of Accounts');
      isExport = true;
    } else if (event.syncType === 'FETCH_BALANCES') {
      xml = buildFetchXML('Trial Balance'); // Export trial balance with closing balances
      isExport = true;
    } else {
      logger.warn(`Unknown syncType: ${event.syncType} — skipping`);
      await markResult(event.id, 'FAILED', null, `Unsupported syncType: ${event.syncType}`);
      return;
    }
  } catch (buildErr) {
    const isValidationError = buildErr.message.startsWith('FAILED_VALIDATION:');
    logger.error(`XML build failed for ${event.id}: ${buildErr.message}`);
    // Validation errors are not retryable — the payload data is bad.
    // Force retryCount to max so the ERP queue item transitions to FAILED permanently.
    const errMsg = isValidationError
      ? `FAILED_NON_RETRYABLE: ${buildErr.message}`
      : `XML build error: ${buildErr.message}`;
    await markResult(event.id, 'FAILED', null, errMsg);
    return;
  }

  // Debug: Save the XML payload to a file
  try {
    fs.writeFileSync(path.join(__dirname, 'debug-last-voucher.xml'), xml);
    logger.debug(`Saved generated XML to debug-last-voucher.xml for inspection.`);
  } catch (err) {
    logger.warn(`Could not write debug XML file: ${err.message}`);
  }

  // ── Post to TallyPrime ────────────────────────────────────────────────────
  try {
    const response = await tallyApi.post('/', xml);
    
    if (isExport) {
      // For export requests, Tally returns the requested data in XML format.
      // We parse it into JSON before passing back to ERP to save them parsing effort.
      logger.info(`✅ SUCCESS (Export): ${event.id} → Fetched data from Tally`);
      try {
        const parsedJson = await xml2js.parseStringPromise(response.data, { explicitArray: false });
        await markResult(event.id, 'SUCCESS', {
          status: 'Accepted',
          json: parsedJson,
        });
      } catch (err) {
        logger.warn(`Failed to parse exported XML for ${event.id}: ${err.message}`);
        await markResult(event.id, 'SUCCESS', {
          status: 'Accepted',
          rawXml: response.data,
        });
      }
      return;
    }

    const tallyResult = await parseTallyResponse(response.data);

    if (tallyResult.success) {
      logger.info(`✅ SUCCESS: ${event.id} → Tally created=${tallyResult.created} altered=${tallyResult.altered}`);
      await markResult(event.id, 'SUCCESS', {
        status: 'Accepted',
        rawXml: tallyResult.rawXml,
        lineno: String(tallyResult.created),
      });
    } else {
      const errMsg = tallyResult.lastdesc
        ? `Tally rejected: ${tallyResult.lastdesc}`
        : `Tally rejected: errors=${tallyResult.errors} exceptions=${tallyResult.exceptions}`;
      logger.warn(`⚠️  FAILED: ${event.id} → ${errMsg}`);
      logger.info(`Raw Tally Response XML:\n${tallyResult.rawXml}`);
      await markResult(event.id, 'FAILED', { status: 'Not Accepted', rawXml: tallyResult.rawXml }, errMsg);
    }
  } catch (netErr) {
    const errMsg = netErr.code === 'ECONNREFUSED'
      ? 'Cannot connect to TallyPrime. Is Tally open and HTTP server enabled on port 9000?'
      : `Network error: ${netErr.message}`;

    logger.error(`❌ NET ERROR: ${event.id} → ${errMsg}`);
    await markResult(event.id, 'FAILED', null, errMsg);
  }
}

// ─── Mark Result Back to ERP ──────────────────────────────────────────────────

async function markResult(eventId, status, tallyResponse, error) {
  try {
    await erpApi.post('/api/tally/connector/mark-result', {
      eventId,
      status,
      tallyResponse: tallyResponse || undefined,
      error: error || undefined,
    });
  } catch (err) {
    logger.error(`Failed to mark result for ${eventId}: ${err.message}`);
  }
}

// ─── Main Poll Loop ───────────────────────────────────────────────────────────

let isProcessing = false;

async function poll() {
  if (isProcessing) return; // Skip if previous batch still running
  isProcessing = true;

  try {
    const res = await erpApi.get('/api/tally/connector/pending');
    const { events, count } = res.data;

    if (count > 0) {
      logger.info(`📥 Fetched ${count} pending event(s)`);
      // Process sequentially to respect Tally's single-threaded nature
      for (const event of events) {
        await processEvent(event);
        // Small delay between events to avoid overwhelming Tally
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      logger.warn(`Cannot reach ERP at ${ERP_BASE_URL} — will retry in ${POLL_MS}ms`);
    } else if (err.response?.status === 401) {
      logger.error('❌ CONNECTOR_SECRET is wrong. Update .env and restart.');
    } else {
      logger.error(`Poll error: ${err.message}`);
    }
  } finally {
    isProcessing = false;
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

logger.info('════════════════════════════════════════════════════════');
logger.info('  Precision Press ERP — TallyPrime Connector Service    ');
logger.info('════════════════════════════════════════════════════════');
logger.info(`  ERP:   ${ERP_BASE_URL}`);
logger.info(`  Tally: ${TALLY_URL}`);
logger.info(`  Poll:  every ${POLL_MS / 1000}s`);
logger.info('  IMPORTANT: TallyPrime must be open with company loaded');
logger.info('════════════════════════════════════════════════════════');

// Initial poll immediately, then on interval
poll();
setInterval(poll, POLL_MS);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  logger.info('Connector shutting down gracefully...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  // Don't exit — keep the service running
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});
